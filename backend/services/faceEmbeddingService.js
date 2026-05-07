const axios = require('axios');
const crypto = require('crypto');

function getEmbeddingConfig() {
    return {
        enabled: String(process.env.FACE_RECOGNITION_ENABLED || 'true').trim().toLowerCase() === 'true',
        serviceUrl: (process.env.FACE_RECOGNITION_SERVICE_URL || process.env.FACE_EMBEDDING_SERVICE_URL || '').trim().replace(/\/+$/, ''),
        servicePath: (process.env.FACE_EMBEDDING_SERVICE_PATH || '/embed').trim(),
        timeoutMs: Number.parseInt(process.env.FACE_EMBEDDING_TIMEOUT_MS || '12000', 10),
        embeddingSize: Number.parseInt(process.env.FACE_EMBEDDING_SIZE || '128', 10),
    };
}

function normalizeEmbedding(values, fallbackSize = 128) {
    const vector = Array.isArray(values)
        ? values.map((value) => Number(value)).filter((value) => Number.isFinite(value))
        : [];

    if (!vector.length) {
        return Array.from({ length: fallbackSize }, () => 0);
    }

    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + (value * value), 0)) || 1;
    return vector.map((value) => Number((value / magnitude).toFixed(8)));
}

function buildLocalEmbedding(buffer, size = 128) {
    const digest = crypto.createHash('sha512').update(buffer).digest();
    const values = [];

    for (let index = 0; index < size; index += 1) {
        const byte = digest[index % digest.length];
        const centered = (byte / 127.5) - 1;
        values.push(centered);
    }

    return normalizeEmbedding(values, size);
}

async function generateFaceEmbedding(faceBuffer, metadata = {}) {
    const config = getEmbeddingConfig();

    if (config.enabled && config.serviceUrl) {
        try {
            const response = await axios.post(
                `${config.serviceUrl}${config.servicePath}`,
                {
                    imageBase64: faceBuffer.toString('base64'),
                    contentType: metadata.contentType || '',
                    trackId: metadata.trackId || '',
                },
                {
                    timeout: config.timeoutMs,
                    headers: { 'Content-Type': 'application/json' },
                }
            );

            const payload = response.data || {};
            const embedding = normalizeEmbedding(
                payload.embedding || payload.vector || payload.embeddingVector || [],
                config.embeddingSize
            );

            if (embedding.some((value) => value !== 0)) {
                return embedding;
            }
        } catch (error) {
            console.warn('[Face Embedding] External embedder unavailable, using local fallback:', error.message);
        }
    }

    return buildLocalEmbedding(faceBuffer, config.embeddingSize);
}

module.exports = {
    buildLocalEmbedding,
    generateFaceEmbedding,
    getEmbeddingConfig,
    normalizeEmbedding,
};
