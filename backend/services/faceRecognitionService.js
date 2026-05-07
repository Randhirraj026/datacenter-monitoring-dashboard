const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const { getPool, isDbConfigured } = require('../db');
const { fetchServerRoomSnapshotBuffer } = require('./cameraFrameService');
const { detectFaces } = require('./faceDetectionService');
const { analyzeLiveFrame } = require('./personDetectionService');
const { generateFaceEmbedding } = require('./faceEmbeddingService');
const { classifyRecognition, compareFaceEmbedding } = require('./faceMatchingService');
const { sendMail } = require('./mailService');

function isTruthy(value) {
    return String(value || '').toLowerCase() === 'true';
}

function getRecognitionConfig() {
    return {
        enabled: isTruthy(process.env.FACE_RECOGNITION_ENABLED || 'true'),
        watchdogIntervalMs: Number.parseInt(process.env.FACE_RECOGNITION_INTERVAL_MS || '2500', 10),
        confirmationFrames: Number.parseInt(process.env.FACE_RECOGNITION_CONFIRMATION_FRAMES || '3', 10),
        authorizedThreshold: Number.parseFloat(process.env.FACE_RECOGNITION_AUTH_THRESHOLD || '0.65'),
        suspiciousThreshold: Number.parseFloat(process.env.FACE_RECOGNITION_SUSPICIOUS_THRESHOLD || '0.5'),
        unknownImageDir: path.resolve(
            __dirname,
            '..',
            process.env.FACE_RECOGNITION_UNKNOWN_DIR || 'runtime/unknown-faces'
        ),
        alertEmailEnabled: isTruthy(process.env.FACE_RECOGNITION_EMAIL_ALERTS || 'true'),
        alertCooldownMs: Number.parseInt(process.env.FACE_RECOGNITION_ALERT_COOLDOWN_MS || '600000', 10),
    };
}

const recognitionState = {
    enabled: getRecognitionConfig().enabled,
    running: false,
    lastProcessedAt: null,
    lastFrameAt: null,
    lastError: '',
    frontendSignal: 'NEUTRAL',
    confirmedState: 'UNKNOWN',
    confirmedEmployeeId: null,
    confirmedEmployeeName: '',
    confirmedDepartment: '',
    confirmedSimilarity: null,
    latestDecision: 'UNKNOWN',
    latestFaces: [],
    latestDetections: [],
};

const trackState = new Map();
const unknownAlertState = new Map();
const embeddingCache = {
    loadedAt: 0,
    employees: [],
    embeddings: [],
};

let watchdogInterval = null;

function normalizeEmbeddingVector(value) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => Number(item)).filter((item) => Number.isFinite(item));
}

function getBufferSignature(buffer) {
    return crypto.createHash('sha1').update(buffer).digest('hex');
}

function safeFileSegment(value) {
    return String(value || '')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 64) || 'face';
}

function getEmployeeSampleDir(employeeId) {
    return path.resolve(
        __dirname,
        '..',
        process.env.FACE_RECOGNITION_EMPLOYEE_DIR || 'runtime/employee-faces',
        safeFileSegment(employeeId || 'unknown')
    );
}

async function saveEmployeeSampleImage(employeeId, imageBuffer, label = 'enrollment') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const employeeDir = getEmployeeSampleDir(employeeId);
    await ensureDirectory(employeeDir);

    const fileName = `${timestamp}-${safeFileSegment(label)}.jpg`;
    const filePath = path.join(employeeDir, fileName);
    await fs.writeFile(filePath, imageBuffer);
    return filePath;
}

function getMatchSampleDir(employeeId) {
    return path.resolve(
        __dirname,
        '..',
        process.env.FACE_RECOGNITION_MATCH_DIR || 'runtime/matched-faces',
        safeFileSegment(employeeId || 'unknown')
    );
}

async function saveMatchSampleImage(employeeId, imageBuffer, label = 'match') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const matchDir = getMatchSampleDir(employeeId);
    await ensureDirectory(matchDir);

    const fileName = `${timestamp}-${safeFileSegment(label)}.jpg`;
    const filePath = path.join(matchDir, fileName);
    await fs.writeFile(filePath, imageBuffer);
    return filePath;
}

function parseImageInput(imageInput) {
    if (!imageInput) return null;

    if (Buffer.isBuffer(imageInput)) {
        return imageInput;
    }

    if (typeof imageInput === 'string') {
        const cleaned = imageInput.includes(',')
            ? imageInput.slice(imageInput.indexOf(',') + 1)
            : imageInput;
        return Buffer.from(cleaned, 'base64');
    }

    if (typeof imageInput === 'object') {
        if (Buffer.isBuffer(imageInput.buffer)) {
            return imageInput.buffer;
        }

        if (typeof imageInput.dataUrl === 'string') {
            return parseImageInput(imageInput.dataUrl);
        }

        if (typeof imageInput.base64 === 'string') {
            return parseImageInput(imageInput.base64);
        }
    }

    return null;
}

async function ensureDirectory(directoryPath) {
    await fs.mkdir(directoryPath, { recursive: true });
}

async function loadEmbeddingIndex(force = false) {
    const cacheTtlMs = Number.parseInt(process.env.FACE_RECOGNITION_EMBEDDING_CACHE_MS || '15000', 10);
    const now = Date.now();

    if (!force && embeddingCache.loadedAt && (now - embeddingCache.loadedAt) < cacheTtlMs) {
        return embeddingCache;
    }

    const pool = getPool();
    if (!pool) {
        embeddingCache.loadedAt = now;
        embeddingCache.employees = [];
        embeddingCache.embeddings = [];
        return embeddingCache;
    }

    const { rows } = await pool.query(`
        SELECT
            e.employee_id,
            e.name,
            e.department,
            fe.id AS embedding_id,
            fe.embedding_vector,
            fe.source_image_path
        FROM employees e
        LEFT JOIN face_embeddings fe ON fe.employee_id = e.employee_id
        ORDER BY e.employee_id ASC, fe.id ASC
    `);

    const employees = new Map();
    const embeddings = [];

    for (const row of rows) {
        if (!employees.has(row.employee_id)) {
            employees.set(row.employee_id, {
                employeeId: row.employee_id,
                employeeName: row.name,
                department: row.department || 'General',
            });
        }

        if (row.embedding_id && row.embedding_vector) {
            embeddings.push({
                embeddingId: row.embedding_id,
                employeeId: row.employee_id,
                employeeName: row.name,
                department: row.department || 'General',
                embeddingVector: normalizeEmbeddingVector(row.embedding_vector),
                sourceImagePath: row.source_image_path || '',
            });
            continue;
        }

        if (row.embedding_id && row.source_image_path) {
            try {
                const sourceBuffer = await fs.readFile(row.source_image_path);
                const embeddingVector = await generateFaceEmbedding(sourceBuffer, {
                    contentType: 'image/jpeg',
                    trackId: `${row.employee_id}-${row.embedding_id}`,
                });

                await pool.query(
                    `UPDATE face_embeddings
                     SET embedding_vector = $1::jsonb, updated_at = now()
                     WHERE id = $2`,
                    [JSON.stringify(embeddingVector), row.embedding_id]
                );

                embeddings.push({
                    embeddingId: row.embedding_id,
                    employeeId: row.employee_id,
                    employeeName: row.name,
                    department: row.department || 'General',
                    embeddingVector,
                    sourceImagePath: row.source_image_path,
                });
            } catch (error) {
                console.warn('[Face Recognition] Failed to rebuild embedding from sample image:', error.message);
            }
        }
    }

    embeddingCache.loadedAt = now;
    embeddingCache.employees = Array.from(employees.values());
    embeddingCache.embeddings = embeddings;
    return embeddingCache;
}

function invalidateEmbeddingIndex() {
    embeddingCache.loadedAt = 0;
    embeddingCache.employees = [];
    embeddingCache.embeddings = [];
}

function getTrackKey(face, bestMatch) {
    return String(
        face.trackId
        || face.signature
        || bestMatch.employeeId
        || `${face.boundingBox?.x || 0}:${face.boundingBox?.y || 0}:${face.boundingBox?.width || 0}:${face.boundingBox?.height || 0}`
        || 'face'
    );
}

async function storeUnknownFaceImage(frameBuffer, contentType, trackKey) {
    const config = getRecognitionConfig();
    await ensureDirectory(config.unknownImageDir);

    const timestamp = new Date();
    const stamp = timestamp.toISOString().replace(/[:.]/g, '-');
    const extension = String(contentType || '').includes('png') ? 'png' : 'jpg';
    const fileName = `${stamp}-${safeFileSegment(trackKey || crypto.randomUUID())}.${extension}`;
    const imagePath = path.join(config.unknownImageDir, fileName);

    await fs.writeFile(imagePath, frameBuffer);

    const pool = getPool();
    if (pool) {
        await pool.query(
            `INSERT INTO unknown_faces (image_path, "timestamp", review_status)
             VALUES ($1, $2, $3)
             RETURNING id`,
            [imagePath, timestamp, 'PENDING']
        );
    }

    return {
        imagePath,
        timestamp: timestamp.toISOString(),
    };
}

async function recordAlertSnapshot(message, severity = 'Critical') {
    const pool = getPool();
    if (!pool) return;

    await pool.query(
        `INSERT INTO alert_snapshots (ts, alert_type, severity, message)
         VALUES (now(), $1, $2, $3)`,
        ['FACE_IMPOSTER', severity, message]
    );
}

async function recordMatchEvent({ employeeId, imagePath, similarity, classification }) {
    const pool = getPool();
    if (!pool) return;

    await pool.query(
        `INSERT INTO face_match_events (employee_id, image_path, similarity, classification, "timestamp")
         VALUES ($1, $2, $3, $4, now())`,
        [
            employeeId || null,
            imagePath,
            Number(similarity || 0),
            String(classification || 'AUTHORIZED').toUpperCase(),
        ]
    );
}

async function saveConfirmedMatchSample({
    employeeId,
    employeeName,
    department,
    frameBuffer,
    contentType,
    trackKey,
    similarity,
    classification,
}) {
    const pool = getPool();
    if (!pool) return null;

    const safeEmployeeId = String(employeeId || '').trim();
    if (!safeEmployeeId || !frameBuffer) return null;

    const timestampLabel = new Date().toISOString().replace(/[:.]/g, '-');
    const sampleLabel = `${classification || 'match'}-${trackKey || 'face'}-${timestampLabel}`;
    const samplePath = await saveMatchSampleImage(safeEmployeeId, frameBuffer, sampleLabel);
    const embedding = await generateFaceEmbedding(frameBuffer, {
        contentType: contentType || 'image/jpeg',
        trackId: `${safeEmployeeId}-${trackKey || 'confirmed'}`,
    });

    await pool.query(
        `INSERT INTO face_embeddings (employee_id, embedding_vector, source_image_path, source_image_name, updated_at)
         VALUES ($1, $2::jsonb, $3, $4, now())`,
        [
            safeEmployeeId,
            JSON.stringify(embedding),
            samplePath,
            path.basename(samplePath),
        ]
    );

    await recordMatchEvent({
        employeeId: safeEmployeeId,
        imagePath: samplePath,
        similarity,
        classification,
    });

    return {
        imagePath: samplePath,
        embedding,
        employeeId: safeEmployeeId,
        employeeName: employeeName || '',
        department: department || 'General',
    };
}

async function sendUnknownFaceEmail(message, details = {}) {
    const config = getRecognitionConfig();
    if (!config.alertEmailEnabled) return;

    try {
        const attachments = [];
        if (details.imagePath) {
            attachments.push({
                filename: path.basename(details.imagePath),
                path: details.imagePath,
            });
        }

        await sendMail({
            subject: 'Unknown person detected in live feed',
            text: [
                'This is an unknown person detected in the live feed.',
                message,
                `Reason: ${details.reason || 'UNKNOWN'}`,
                `Track: ${details.trackKey || 'n/a'}`,
                `Similarity: ${details.similarity != null ? Number(details.similarity).toFixed(3) : 'n/a'}`,
                `Captured At: ${details.capturedAt || new Date().toISOString()}`,
            ].join('\n'),
            attachments,
        });
    } catch (error) {
        console.warn('[Face Recognition] Unknown-person email alert failed:', error.message);
    }
}

async function saveUnknownFace({ frameBuffer, contentType, trackKey, bestMatch, similarity, reason = 'UNKNOWN', alertKey }) {
    const safeSimilarity = Number.isFinite(Number(similarity)) ? Number(similarity) : 0
    const cacheKey = `alert:${String(alertKey || trackKey || reason || 'unknown').trim()}`
    const config = getRecognitionConfig()
    const lastAlertAt = unknownAlertState.get(cacheKey)
    const now = Date.now()
    const cooldownMs = config.alertCooldownMs || 600000

    // If we've already alerted for this specific track/key recently, skip to avoid spam
    if (lastAlertAt && (now - lastAlertAt) < cooldownMs) {
        return null
    }

    unknownAlertState.set(cacheKey, now)
    // We expect frameBuffer to be the face crop if available
    const stored = await storeUnknownFaceImage(frameBuffer, contentType, trackKey)
    const message = `Unknown person detected in server room. Reason=${reason}. Similarity=${safeSimilarity.toFixed(3)}`

    console.log(`[Face Recognition] Sending immediate email alert for ${cacheKey}`)

    await recordAlertSnapshot(message, 'Critical')
    await sendUnknownFaceEmail(message, {
        reason,
        employeeName: bestMatch?.employeeName || '',
        similarity: safeSimilarity,
        trackKey,
        imagePath: stored?.imagePath,
        capturedAt: stored?.timestamp,
    })

    return stored
}

function summarizeRecognition({ classification, bestMatch, face, confirmed }) {
    return {
        trackId: face.trackId || face.signature || '',
        signature: face.signature || '',
        kind: 'face',
        source: face.source || 'unknown',
        label: classification === 'AUTHORIZED'
            ? `EMPLOYEE: ${bestMatch.employeeName || 'Authorized'}`
            : 'Unknown person',
        confidence: Number(face.confidence || 0),
        classification,
        confirmed,
        employeeId: bestMatch.employeeId || null,
        employeeName: bestMatch.employeeName || '',
        department: bestMatch.department || '',
        similarity: Number(bestMatch.similarity || 0),
        boundingBox: face.boundingBox || null,
    };
}

function summarizePersonDetection(person = {}) {
    return {
        trackId: person.trackId || person.signature || '',
        signature: person.signature || '',
        kind: 'person',
        source: person.source || 'person-detector',
        label: person.label || 'Person',
        confidence: Number(person.confidence || 0),
        classification: 'UNKNOWN',
        confirmed: false,
        employeeId: null,
        employeeName: '',
        department: '',
        similarity: null,
        boundingBox: person.boundingBox || null,
    };
}

async function updateTrackObservation(trackKey, payload) {
    const config = getRecognitionConfig();
    const previous = trackState.get(trackKey) || {
        consecutive: 0,
        lastClassification: '',
        confirmed: false,
        alerted: false,
    };

    const sameClassification = previous.lastClassification === payload.classification;
    const consecutive = sameClassification ? previous.consecutive + 1 : 1;
    const confirmed = payload.classification !== 'IMPOSTER' && consecutive >= config.confirmationFrames;
    let alerted = previous.alerted;
    let confirmedState = 'UNKNOWN';
    let confirmedEmployeeId = null;
    let confirmedEmployeeName = '';
    let confirmedDepartment = '';
    let confirmedSimilarity = null;
    let frontendSignal = 'AMBER';

    if (payload.classification === 'IMPOSTER') {
        frontendSignal = 'RED';
        confirmedState = 'UNKNOWN';
        if (!alerted) {
            await saveUnknownFace({
                ...payload,
                reason: 'IMPOSTER',
                alertKey: trackKey,
            });
            alerted = true;
        }
    } else if (payload.classification !== 'AUTHORIZED' && !alerted) {
        try {
            await saveUnknownFace({
                ...payload,
                reason: payload.classification || 'UNKNOWN',
                alertKey: trackKey,
            });
            alerted = true;
        } catch (error) {
            console.warn('[Face Recognition] Failed to save unknown face sample:', error.message);
        }
    } else if (confirmed) {
        frontendSignal = payload.classification === 'AUTHORIZED' ? 'GREEN' : 'AMBER';
        confirmedState = payload.classification === 'AUTHORIZED' ? 'AUTHORIZED' : 'UNKNOWN';
        confirmedEmployeeId = payload.bestMatch.employeeId || null;
        confirmedEmployeeName = payload.bestMatch.employeeName || '';
        confirmedDepartment = payload.bestMatch.department || '';
        confirmedSimilarity = payload.bestMatch.similarity || null;

        if (payload.classification === 'AUTHORIZED' && !previous.confirmed) {
            try {
                await saveConfirmedMatchSample({
                    employeeId: confirmedEmployeeId || payload.bestMatch.employeeId || null,
                    employeeName: confirmedEmployeeName || payload.bestMatch.employeeName || '',
                    department: confirmedDepartment || payload.bestMatch.department || 'General',
                    frameBuffer: payload.frameBuffer,
                    contentType: payload.contentType,
                    trackKey: payload.trackKey,
                    similarity: confirmedSimilarity || payload.bestMatch.similarity || 0,
                    classification: payload.classification,
                });
            } catch (error) {
                console.warn('[Face Recognition] Failed to save confirmed match sample:', error.message);
            }
        }
    }

    trackState.set(trackKey, {
        consecutive,
        lastClassification: payload.classification,
        confirmed: confirmed || previous.confirmed,
        alerted,
        lastSeenAt: new Date().toISOString(),
        confirmedState,
        confirmedEmployeeId,
        confirmedEmployeeName,
        confirmedDepartment,
        confirmedSimilarity,
        frontendSignal,
    });

    return trackState.get(trackKey);
}

async function processRecognitionFrame({ force = false } = {}) {
    const config = getRecognitionConfig();
    recognitionState.enabled = config.enabled;

    if (!config.enabled) {
        recognitionState.frontendSignal = 'NEUTRAL';
        recognitionState.confirmedState = 'DISABLED';
        recognitionState.confirmedEmployeeId = null;
        recognitionState.confirmedEmployeeName = '';
        recognitionState.confirmedDepartment = '';
        recognitionState.confirmedSimilarity = null;
        recognitionState.latestFaces = [];
        recognitionState.latestDetections = [];
        recognitionState.latestDecision = 'NONE';
        return recognitionState;
    }

    if (!isDbConfigured()) {
        recognitionState.lastError = 'Database is not configured';
        recognitionState.frontendSignal = 'NEUTRAL';
        recognitionState.confirmedState = 'UNKNOWN';
        recognitionState.confirmedEmployeeId = null;
        recognitionState.confirmedEmployeeName = '';
        recognitionState.confirmedDepartment = '';
        recognitionState.confirmedSimilarity = null;
        recognitionState.latestFaces = [];
        recognitionState.latestDetections = [];
        recognitionState.latestDecision = 'NONE';
        return recognitionState;
    }

    try {
        const snapshot = await fetchServerRoomSnapshotBuffer();
        recognitionState.lastFrameAt = new Date().toISOString();
        const faces = await detectFaces(snapshot.buffer, snapshot.contentType);
        let analysis = null;
        let faceCandidates = faces;

        if (!faceCandidates.length) {
            analysis = await analyzeLiveFrame(snapshot.buffer, snapshot.contentType);
            faceCandidates = Array.isArray(analysis?.faces) ? analysis.faces : [];
        }

        const index = await loadEmbeddingIndex(force);
        const latestFaces = [];
        const latestDetections = [];
        let worstSignal = 'GREEN';
        let confirmedState = 'UNKNOWN';
        let confirmedEmployeeId = null;
        let confirmedEmployeeName = '';
        let confirmedDepartment = '';
        let confirmedSimilarity = null;
        let bestAuthorizedCandidate = null;
        const persons = Array.isArray(analysis?.persons) ? analysis.persons : [];

        if (!faceCandidates.length) {
            if (persons.length) {
                const personDetections = persons.map((person) => summarizePersonDetection(person));
                const personTrackKey = personDetections
                    .map((person) => person.trackId || person.signature || '')
                    .filter(Boolean)
                    .join('|') || `person-${getBufferSignature(snapshot.buffer)}`;
                const personCapture = persons
                    .map((person) => ({
                        ...person,
                        area: Number(person?.boundingBox?.width || 0) * Number(person?.boundingBox?.height || 0),
                    }))
                    .sort((left, right) => right.area - left.area)[0] || null;
                const personCaptureBuffer = personCapture?.cropBuffer || snapshot.buffer;
                const personCaptureType = personCapture?.cropBuffer ? snapshot.contentType : snapshot.contentType;

                try {
                    await saveUnknownFace({
                        frameBuffer: personCaptureBuffer,
                        contentType: personCaptureType,
                        trackKey: personTrackKey,
                        reason: 'PERSON_DETECTED',
                        alertKey: personTrackKey,
                    });
                } catch (error) {
                    console.warn('[Face Recognition] Failed to save person-only unknown face:', error.message);
                }

                recognitionState.lastProcessedAt = new Date().toISOString();
                recognitionState.lastError = '';
                recognitionState.latestFaces = [];
                recognitionState.latestDetections = personDetections;
                recognitionState.frontendSignal = 'AMBER';
                recognitionState.confirmedState = 'UNKNOWN';
                recognitionState.confirmedEmployeeId = null;
                recognitionState.confirmedEmployeeName = '';
                recognitionState.confirmedDepartment = '';
                recognitionState.confirmedSimilarity = null;
                recognitionState.latestDecision = 'UNKNOWN';

                return getFaceRecognitionStatus();
            }

            recognitionState.lastProcessedAt = new Date().toISOString();
            recognitionState.lastError = '';
            recognitionState.latestFaces = [];
            recognitionState.latestDetections = [];
            recognitionState.frontendSignal = 'NEUTRAL';
            recognitionState.confirmedState = 'UNKNOWN';
            recognitionState.confirmedEmployeeId = null;
            recognitionState.confirmedEmployeeName = '';
            recognitionState.confirmedDepartment = '';
            recognitionState.confirmedSimilarity = null;
            recognitionState.latestDecision = 'NONE';
            return getFaceRecognitionStatus();
        }

        for (const face of faceCandidates) {
            const faceBuffer = face.cropBuffer || snapshot.buffer;
            const embedding = await generateFaceEmbedding(faceBuffer, {
                contentType: snapshot.contentType,
                trackId: face.trackId,
            });
            const bestMatch = compareFaceEmbedding(embedding, index.embeddings);
            bestMatch.similarity = Number(bestMatch.similarity || 0);

            const classification = classifyRecognition(bestMatch.similarity, {
                authorizedThreshold: config.authorizedThreshold,
                suspiciousThreshold: config.suspiciousThreshold,
            });
            const trackKey = getTrackKey(face, bestMatch);
            const trackObservation = await updateTrackObservation(trackKey, {
                frameBuffer: faceBuffer,
                contentType: snapshot.contentType,
                trackKey,
                bestMatch,
                similarity: bestMatch.similarity,
                classification,
            });

            const confirmed = Boolean(trackObservation?.confirmed && trackObservation?.confirmedState === classification);
            const faceSummary = summarizeRecognition({ classification, bestMatch, face, confirmed });
            latestFaces.push(faceSummary);
            latestDetections.push(faceSummary);

            if (classification === 'AUTHORIZED') {
                if (!bestAuthorizedCandidate || bestMatch.similarity > Number(bestAuthorizedCandidate.similarity || 0)) {
                    bestAuthorizedCandidate = {
                        employeeId: bestMatch.employeeId || null,
                        employeeName: bestMatch.employeeName || '',
                        department: bestMatch.department || '',
                        similarity: bestMatch.similarity || 0,
                    };
                }
            }

            if (trackObservation?.frontendSignal === 'RED') {
                worstSignal = 'RED';
                confirmedState = 'IMPOSTER';
            } else if (trackObservation?.frontendSignal === 'AMBER' && worstSignal !== 'RED') {
                worstSignal = 'AMBER';
                if (trackObservation?.confirmed) {
                    confirmedState = classification;
                    confirmedEmployeeId = trackObservation.confirmedEmployeeId || bestMatch.employeeId || null;
                    confirmedEmployeeName = trackObservation.confirmedEmployeeName || bestMatch.employeeName || '';
                    confirmedDepartment = trackObservation.confirmedDepartment || bestMatch.department || '';
                    confirmedSimilarity = trackObservation.confirmedSimilarity || bestMatch.similarity || null;
                }
            } else if (trackObservation?.frontendSignal === 'GREEN' && worstSignal === 'GREEN') {
                confirmedState = classification;
                confirmedEmployeeId = trackObservation.confirmedEmployeeId || bestMatch.employeeId || null;
                confirmedEmployeeName = trackObservation.confirmedEmployeeName || bestMatch.employeeName || '';
                confirmedDepartment = trackObservation.confirmedDepartment || bestMatch.department || '';
                confirmedSimilarity = trackObservation.confirmedSimilarity || bestMatch.similarity || null;
            }
        }

        recognitionState.lastProcessedAt = new Date().toISOString();
        recognitionState.lastError = '';
        recognitionState.latestFaces = latestFaces;
        recognitionState.latestDetections = latestDetections;
        recognitionState.frontendSignal = worstSignal;
        recognitionState.confirmedState = confirmedState;
        recognitionState.confirmedEmployeeId = confirmedEmployeeId;
        recognitionState.confirmedEmployeeName = confirmedEmployeeName;
        recognitionState.confirmedDepartment = confirmedDepartment;
        recognitionState.confirmedSimilarity = confirmedSimilarity;
        if (bestAuthorizedCandidate) {
            recognitionState.latestDecision = 'EMPLOYEE';
            recognitionState.confirmedState = 'AUTHORIZED';
            recognitionState.confirmedEmployeeId = bestAuthorizedCandidate.employeeId;
            recognitionState.confirmedEmployeeName = bestAuthorizedCandidate.employeeName;
            recognitionState.confirmedDepartment = bestAuthorizedCandidate.department;
            recognitionState.confirmedSimilarity = bestAuthorizedCandidate.similarity;
        } else {
            recognitionState.latestDecision = 'UNKNOWN';
        }

        return getFaceRecognitionStatus();
    } catch (error) {
        recognitionState.lastError = error.message || 'Face recognition processing failed';
        recognitionState.frontendSignal = 'NEUTRAL';
        recognitionState.confirmedState = 'UNKNOWN';
        recognitionState.confirmedEmployeeId = null;
        recognitionState.confirmedEmployeeName = '';
        recognitionState.confirmedDepartment = '';
        recognitionState.confirmedSimilarity = null;
        recognitionState.latestFaces = [];
        recognitionState.latestDetections = [];
        recognitionState.latestDecision = 'UNKNOWN';
        return getFaceRecognitionStatus();
    }
}

function getFaceRecognitionStatus() {
    return {
        enabled: recognitionState.enabled,
        running: recognitionState.running,
        lastProcessedAt: recognitionState.lastProcessedAt,
        lastFrameAt: recognitionState.lastFrameAt,
        lastError: recognitionState.lastError,
        frontendSignal: recognitionState.frontendSignal,
        confirmedState: recognitionState.confirmedState,
        confirmedEmployeeId: recognitionState.confirmedEmployeeId,
        confirmedEmployeeName: recognitionState.confirmedEmployeeName,
        confirmedDepartment: recognitionState.confirmedDepartment,
        confirmedSimilarity: recognitionState.confirmedSimilarity,
        latestDecision: recognitionState.latestDecision,
        latestFaces: recognitionState.latestFaces,
        latestDetections: recognitionState.latestDetections,
    };
}

async function upsertEmployeeRecord({ employee_id: employeeId, name, department = 'General' }) {
    const pool = getPool();
    if (!pool) {
        throw new Error('Database not configured');
    }

    if (!employeeId || !name) {
        throw new Error('employee_id and name are required');
    }

    await pool.query(
        `INSERT INTO employees (employee_id, name, department, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (employee_id)
         DO UPDATE SET name = EXCLUDED.name,
                       department = EXCLUDED.department,
                       updated_at = now()`,
        [String(employeeId).trim(), String(name).trim(), String(department || 'General').trim() || 'General']
    );

    await pool.query(
        `INSERT INTO biometric_employees (employee_id, name, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (employee_id)
         DO UPDATE SET name = EXCLUDED.name,
                       updated_at = now()`,
        [String(employeeId).trim(), String(name).trim()]
    );

    invalidateEmbeddingIndex();

    return {
        employee_id: String(employeeId).trim(),
        name: String(name).trim(),
        department: String(department || 'General').trim() || 'General',
    };
}

async function saveEmployeeEmbeddings(employeeId, images = []) {
    const pool = getPool();
    if (!pool) {
        throw new Error('Database not configured');
    }

    const normalizedImages = images
        .map((image) => parseImageInput(image))
        .filter(Boolean);

    if (!normalizedImages.length) {
        throw new Error('At least one passport-size image is required');
    }

    const employee = await pool.query('SELECT employee_id, name, department FROM employees WHERE employee_id = $1', [String(employeeId).trim()]);
    if (!employee.rows.length) {
        throw new Error(`Employee ${employeeId} not found`);
    }

    const inserted = [];
    for (const [index, imageBuffer] of normalizedImages.entries()) {
        const embedding = await generateFaceEmbedding(imageBuffer, {
            contentType: 'image/jpeg',
            trackId: `${employeeId}-${index}`,
        });
        const samplePath = await saveEmployeeSampleImage(employeeId, imageBuffer, `enrollment-${index + 1}`);

        const result = await pool.query(
            `INSERT INTO face_embeddings (employee_id, embedding_vector, source_image_path, source_image_name, updated_at)
             VALUES ($1, $2::jsonb, $3, $4, now())
             RETURNING id`,
            [String(employeeId).trim(), JSON.stringify(embedding), samplePath, `enrollment-${index + 1}`]
        );

        inserted.push({
            id: result.rows[0].id,
            embedding,
            samplePath,
        });
    }

    invalidateEmbeddingIndex();

    return {
        employee: employee.rows[0],
        embeddingsStored: inserted.length,
    };
}

async function getEmployeeDirectory() {
    const pool = getPool();
    if (!pool) return [];

    const { rows } = await pool.query(`
        SELECT
            e.employee_id,
            e.name,
            e.department,
            e.created_at,
            e.updated_at,
            COUNT(fe.id)::int AS embedding_count,
            latest.source_image_path AS latest_source_image_path,
            latest.source_image_name AS latest_source_image_name
        FROM employees e
        LEFT JOIN face_embeddings fe ON fe.employee_id = e.employee_id
        LEFT JOIN LATERAL (
            SELECT source_image_path, source_image_name
            FROM face_embeddings fe2
            WHERE fe2.employee_id = e.employee_id AND fe2.source_image_path IS NOT NULL
            ORDER BY fe2.updated_at DESC, fe2.id DESC
            LIMIT 1
        ) latest ON TRUE
        GROUP BY e.employee_id, e.name, e.department, e.created_at, e.updated_at
                 , latest.source_image_path, latest.source_image_name
        ORDER BY e.employee_id ASC
    `);

    return rows;
}

async function getEmployeeLatestPhotoPath(employeeId) {
    const pool = getPool();
    if (!pool) return null;

    const { rows } = await pool.query(
        `SELECT source_image_path
         FROM face_embeddings
         WHERE employee_id = $1 AND source_image_path IS NOT NULL
         ORDER BY updated_at DESC, id DESC
         LIMIT 1`,
        [String(employeeId).trim()]
    );

    return rows[0]?.source_image_path || null;
}

async function deleteEmployee(employeeId) {
    const pool = getPool();
    if (!pool) {
        throw new Error('Database not configured');
    }

    await pool.query('DELETE FROM employees WHERE employee_id = $1', [String(employeeId).trim()]);
    invalidateEmbeddingIndex();
    return { success: true };
}

async function getUnknownFaces(limit = 25) {
    const pool = getPool();
    if (!pool) return [];

    const safeLimit = Math.max(1, Math.min(Number(limit || 25), 100));
    const { rows } = await pool.query(
        `SELECT id, image_path, "timestamp" AS timestamp, review_status
         FROM unknown_faces
         WHERE review_status = 'PENDING'
         ORDER BY "timestamp" DESC, id DESC
         LIMIT $1`,
        [safeLimit]
    );

    return rows;
}

async function getUnknownFaceById(unknownFaceId) {
    const pool = getPool();
    if (!pool) return null;

    const { rows } = await pool.query(
        `SELECT id, image_path, "timestamp" AS timestamp, review_status
         FROM unknown_faces
         WHERE id = $1`,
        [Number(unknownFaceId)]
    );

    return rows[0] || null;
}

async function reviewUnknownFace({
    unknown_face_id: unknownFaceId,
    employee_id: employeeId,
    name,
    department = 'General',
    review_status: reviewStatus,
    approved,
}) {
    const pool = getPool();
    if (!pool) {
        throw new Error('Database not configured');
    }

    if (!unknownFaceId) {
        throw new Error('unknown_face_id is required');
    }

    const unknownFaceResult = await pool.query(
        'SELECT id, image_path, "timestamp", review_status FROM unknown_faces WHERE id = $1',
        [Number(unknownFaceId)]
    );

    if (!unknownFaceResult.rows.length) {
        throw new Error(`Unknown face ${unknownFaceId} not found`);
    }

    const record = unknownFaceResult.rows[0];

    const normalizedReviewStatus = typeof approved === 'boolean'
        ? (approved ? 'APPROVED' : 'REJECTED')
        : String(reviewStatus || 'APPROVED').toUpperCase();

    if (normalizedReviewStatus === 'APPROVED') {
        const imageBuffer = await fs.readFile(record.image_path);
        const targetEmployeeId = String(employeeId || '').trim();
        const targetName = String(name || '').trim();
        if (!targetEmployeeId || !targetName) {
            throw new Error('employee_id and name are required to approve an unknown face');
        }

        await upsertEmployeeRecord({
            employee_id: targetEmployeeId,
            name: targetName,
            department,
        });

        const embedding = await generateFaceEmbedding(imageBuffer, {
            contentType: 'image/jpeg',
            trackId: `unknown-${record.id}`,
        });
        const samplePath = await saveEmployeeSampleImage(targetEmployeeId, imageBuffer, `approved-unknown-${record.id}`);

        await pool.query(
            `INSERT INTO face_embeddings (employee_id, embedding_vector, source_image_path, source_image_name, updated_at)
             VALUES ($1, $2::jsonb, $3, $4, now())`,
            [targetEmployeeId, JSON.stringify(embedding), samplePath, path.basename(record.image_path)]
        );

        await pool.query(
            'UPDATE unknown_faces SET review_status = $1 WHERE id = $2',
            [normalizedReviewStatus, Number(unknownFaceId)]
        );
    } else {
        // REJECTED - Delete both record and physical file
        await pool.query('DELETE FROM unknown_faces WHERE id = $1', [Number(unknownFaceId)]);
        try {
            if (record.image_path && (await fs.stat(record.image_path).catch(() => null))) {
                await fs.unlink(record.image_path);
            }
        } catch (fileErr) {
            console.warn('[reviewUnknownFace] Failed to delete rejected image file:', fileErr.message);
        }
    }

    invalidateEmbeddingIndex();
    return {
        success: true,
        unknown_face_id: Number(unknownFaceId),
        review_status: normalizedReviewStatus,
        deleted: normalizedReviewStatus !== 'APPROVED',
    };
}

async function processRecognitionLoop() {
    if (recognitionState.running) return getFaceRecognitionStatus();

    recognitionState.running = true;
    try {
        return await processRecognitionFrame();
    } finally {
        recognitionState.running = false;
    }
}

function startFaceRecognitionWatchdog() {
    const config = getRecognitionConfig();
    if (!config.enabled) {
        recognitionState.enabled = false;
        return getFaceRecognitionStatus();
    }

    if (watchdogInterval) return getFaceRecognitionStatus();

    console.log('[Face Recognition] Starting background watchdog...');
    watchdogInterval = setInterval(() => {
        processRecognitionLoop().catch((error) => {
            recognitionState.lastError = error.message || 'Face recognition watchdog failed';
        });
    }, Math.max(1000, config.watchdogIntervalMs));

    processRecognitionLoop().catch((error) => {
        recognitionState.lastError = error.message || 'Face recognition initial run failed';
    });

    return getFaceRecognitionStatus();
}

module.exports = {
    deleteEmployee,
    getEmployeeDirectory,
    getFaceRecognitionStatus,
    getEmployeeLatestPhotoPath,
    getUnknownFaces,
    getUnknownFaceById,
    invalidateEmbeddingIndex,
    loadEmbeddingIndex,
    processRecognitionFrame,
    reviewUnknownFace,
    saveEmployeeEmbeddings,
    startFaceRecognitionWatchdog,
    upsertEmployeeRecord,
};
