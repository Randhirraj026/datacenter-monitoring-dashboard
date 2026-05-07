const axios = require('axios');
const crypto = require('crypto');

let warnedDetectorMissing = false;
let warnedDetectorError = false;

function getPersonDetectionConfig() {
    return {
        enabled: String(process.env.PERSON_DETECTION_ENABLED || 'true').trim().toLowerCase() === 'true',
        serviceUrl: (process.env.PERSON_DETECTION_SERVICE_URL || process.env.PERSON_DETECTION_URL || '').trim().replace(/\/+$/, ''),
        servicePath: (process.env.PERSON_DETECTION_SERVICE_PATH || '/analyze-frame').trim(),
        timeoutMs: Number.parseInt(process.env.PERSON_DETECTION_TIMEOUT_MS || '8000', 10),
        minConfidence: Number.parseFloat(process.env.PERSON_DETECTION_MIN_CONFIDENCE || '0.35'),
    };
}

function getBufferSignature(buffer) {
    return crypto.createHash('sha1').update(buffer).digest('hex');
}

function normalizeBoundingBox(box = {}) {
    return {
        x: Number(box.x ?? box.left ?? 0),
        y: Number(box.y ?? box.top ?? 0),
        width: Number(box.width ?? box.w ?? 0),
        height: Number(box.height ?? box.h ?? 0),
    };
}

function normalizeDetections(items, frameBuffer, kind) {
    return items.map((item, index) => {
        const cropBase64 = String(item?.cropBase64 || item?.faceBase64 || '').trim();
        const cropBuffer = cropBase64
            ? Buffer.from(cropBase64.replace(/^data:[^,]+,/, ''), 'base64')
            : frameBuffer;
        const boundingBox = normalizeBoundingBox(item?.boundingBox || item?.box || {});
        const confidence = Number(item?.confidence ?? 0);

        return {
            index,
            trackId: String(item?.trackId || item?.track_id || item?.id || '').trim(),
            kind,
            label: String(item?.label || item?.name || (kind === 'face' ? 'Face detected' : 'Person detected')).trim(),
            confidence,
            boundingBox,
            cropBuffer,
            cropBase64,
            source: 'external',
            signature: getBufferSignature(cropBuffer),
        };
    });
}

function normalizePayload(payload, frameBuffer) {
    const persons = Array.isArray(payload?.persons) ? payload.persons : [];
    const faces = Array.isArray(payload?.faces) ? payload.faces : [];
    const config = getPersonDetectionConfig();

    return {
        analyzedAt: String(payload?.analyzedAt || new Date().toISOString()),
        personCount: Number.isFinite(Number(payload?.personCount)) ? Number(payload.personCount) : persons.length,
        faceCount: Number.isFinite(Number(payload?.faceCount)) ? Number(payload.faceCount) : faces.length,
        persons: normalizeDetections(persons, frameBuffer, 'person').filter((item) => item.confidence >= config.minConfidence),
        faces: normalizeDetections(faces, frameBuffer, 'face').filter((item) => item.confidence >= config.minConfidence),
    };
}

async function analyzeLiveFrame(frameBuffer, contentType = '') {
    const config = getPersonDetectionConfig();

    if (!config.enabled) {
        return {
            analyzedAt: new Date().toISOString(),
            personCount: 0,
            faceCount: 0,
            persons: [],
            faces: [],
        };
    }

    if (!config.serviceUrl) {
        if (!warnedDetectorMissing) {
            warnedDetectorMissing = true;
            console.warn('[Person Detection] No detector configured. Set PERSON_DETECTION_SERVICE_URL to enable live person detection.');
        }

        return {
            analyzedAt: new Date().toISOString(),
            personCount: 0,
            faceCount: 0,
            persons: [],
            faces: [],
        };
    }

    try {
        const response = await axios.post(
            `${config.serviceUrl}${config.servicePath}`,
            {
                imageBase64: frameBuffer.toString('base64'),
                contentType,
            },
            {
                timeout: config.timeoutMs,
                headers: { 'Content-Type': 'application/json' },
            }
        );

        return normalizePayload(response.data, frameBuffer);
    } catch (error) {
        if (!warnedDetectorError) {
            warnedDetectorError = true;
            console.warn('[Person Detection] External detector unavailable, skipping live presence analysis:', error.message);
        }

        return {
            analyzedAt: new Date().toISOString(),
            personCount: 0,
            faceCount: 0,
            persons: [],
            faces: [],
        };
    }
}

module.exports = {
    analyzeLiveFrame,
    getPersonDetectionConfig,
};
