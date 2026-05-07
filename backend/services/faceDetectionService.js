const axios = require('axios');
const crypto = require('crypto');

let warnedDetectorMissing = false;

function getDetectionConfig() {
    return {
        enabled: String(process.env.FACE_RECOGNITION_ENABLED || 'true').trim().toLowerCase() === 'true',
        serviceUrl: (process.env.FACE_RECOGNITION_SERVICE_URL || process.env.FACE_DETECTION_SERVICE_URL || '').trim().replace(/\/+$/, ''),
        servicePath: (process.env.FACE_DETECTION_SERVICE_PATH || '/detect-faces').trim(),
        timeoutMs: Number.parseInt(process.env.FACE_DETECTION_TIMEOUT_MS || '12000', 10),
        minConfidence: Number.parseFloat(process.env.FACE_DETECTION_MIN_CONFIDENCE || '0.35'),
    };
}

function getBufferSignature(buffer) {
    return crypto.createHash('sha1').update(buffer).digest('hex');
}

function normalizeFaces(payload, frameBuffer) {
    const faces = Array.isArray(payload?.faces) ? payload.faces : [];

    return faces.map((face, index) => {
        const cropBase64 = String(face.cropBase64 || face.faceBase64 || '').trim();
        const cropBuffer = cropBase64
            ? Buffer.from(cropBase64.replace(/^data:[^,]+,/, ''), 'base64')
            : frameBuffer;

        const box = face.boundingBox || face.box || {};
        return {
            index,
            trackId: String(face.trackId || face.track_id || face.id || '').trim(),
            confidence: Number(face.confidence ?? 0),
            boundingBox: {
                x: Number(box.x ?? box.left ?? 0),
                y: Number(box.y ?? box.top ?? 0),
                width: Number(box.width ?? box.w ?? 0),
                height: Number(box.height ?? box.h ?? 0),
            },
            cropBuffer,
            cropBase64,
            source: 'external',
        };
    });
}

async function detectFaces(frameBuffer, contentType = '') {
    const config = getDetectionConfig();

    if (!config.enabled) {
        return [];
    }

    if (config.serviceUrl) {
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

            const faces = normalizeFaces(response.data, frameBuffer).filter((face) => face.confidence >= config.minConfidence);
            if (faces.length) {
                return faces.map((face) => ({
                    ...face,
                    signature: getBufferSignature(face.cropBuffer),
                }));
            }
        } catch (error) {
            console.warn('[Face Detection] External face detector unavailable for this frame:', error.message);
        }
    }

    if (!warnedDetectorMissing) {
        warnedDetectorMissing = true;
        console.warn('[Face Detection] No face detector configured. The person-detection fallback can still report live presence if PERSON_DETECTION_SERVICE_URL is set.');
    }

    return [];
}

module.exports = {
    detectFaces,
    getDetectionConfig,
};
