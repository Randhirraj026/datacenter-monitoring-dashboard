function cosineSimilarity(left = [], right = []) {
    if (!Array.isArray(left) || !Array.isArray(right) || !left.length || !right.length) {
        return 0;
    }

    const length = Math.min(left.length, right.length);
    let dot = 0;
    let leftMagnitude = 0;
    let rightMagnitude = 0;

    for (let index = 0; index < length; index += 1) {
        const leftValue = Number(left[index]) || 0;
        const rightValue = Number(right[index]) || 0;
        dot += leftValue * rightValue;
        leftMagnitude += leftValue * leftValue;
        rightMagnitude += rightValue * rightValue;
    }

    if (!leftMagnitude || !rightMagnitude) {
        return 0;
    }

    return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function compareFaceEmbedding(candidateEmbedding, storedEmbeddings = []) {
    let bestMatch = null;

    for (const record of storedEmbeddings) {
        const similarity = cosineSimilarity(candidateEmbedding, record.embeddingVector);
        if (!bestMatch || similarity > bestMatch.similarity) {
            bestMatch = {
                employeeId: record.employeeId,
                employeeName: record.employeeName,
                department: record.department,
                embeddingId: record.embeddingId,
                similarity,
            };
        }
    }

    return bestMatch || {
        employeeId: null,
        employeeName: '',
        department: '',
        embeddingId: null,
        similarity: 0,
    };
}

function classifyRecognition(similarity, thresholds = {}) {
    const authorizedThreshold = Number.isFinite(Number(thresholds.authorizedThreshold))
        ? Number(thresholds.authorizedThreshold)
        : 0.65;
    const suspiciousThreshold = Number.isFinite(Number(thresholds.suspiciousThreshold))
        ? Number(thresholds.suspiciousThreshold)
        : 0.5;

    if (similarity > authorizedThreshold) {
        return 'AUTHORIZED';
    }

    if (similarity >= suspiciousThreshold) {
        return 'SUSPICIOUS';
    }

    return 'IMPOSTER';
}

module.exports = {
    classifyRecognition,
    compareFaceEmbedding,
    cosineSimilarity,
};
