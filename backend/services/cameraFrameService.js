const axios = require('axios');
const https = require('https');
const crypto = require('crypto');

function isTruthy(value) {
    return String(value || '').toLowerCase() === 'true';
}

function getCameraConfig() {
    const fallbackPaths = String(
        process.env.CAMERA_SERVER_ROOM_FALLBACK_PATHS ||
        '/cgi-bin/snapshot.cgi?channel=1,/cgi-bin/mjpg/video.cgi?channel=1&subtype=1,/webcapture.jpg?command=snap&channel=1,/cgi-bin/snapshot.cgi,/cgi-bin/snapshot.cgi?1,/onvif-http/snapshot?Profile_1'
    )
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

    return {
        baseUrl: (process.env.CAMERA_SERVER_ROOM_BASE_URL || 'http://172.30.0.102').trim().replace(/\/+$/, ''),
        path: (process.env.CAMERA_SERVER_ROOM_PATH || '/cgi-bin/snapshot.cgi?channel=1').trim(),
        fallbackPaths,
        username: (process.env.CAMERA_SERVER_ROOM_USERNAME || '').trim(),
        password: (process.env.CAMERA_SERVER_ROOM_PASSWORD || '').trim(),
        authType: (process.env.CAMERA_SERVER_ROOM_AUTH_TYPE || 'auto').trim().toLowerCase(),
        bearerToken: (process.env.CAMERA_SERVER_ROOM_BEARER_TOKEN || '').trim(),
        verifyTls: isTruthy(process.env.CAMERA_SERVER_ROOM_VERIFY_TLS),
        timeoutMs: Number.parseInt(process.env.CAMERA_SERVER_ROOM_TIMEOUT_MS || '20000', 10),
    };
}

function md5(value) {
    return crypto.createHash('md5').update(String(value)).digest('hex');
}

function parseDigestChallenge(headerValue) {
    const text = String(headerValue || '');
    if (!/^digest\s+/i.test(text)) return null;

    const values = {};
    const pattern = /([a-z0-9_-]+)=("([^"]*)"|([^,\s]+))/gi;
    let match = pattern.exec(text);
    while (match) {
        values[match[1].toLowerCase()] = match[3] || match[4] || '';
        match = pattern.exec(text);
    }

    return values.realm && values.nonce ? values : null;
}

function buildDigestAuthorizationHeader(targetUrl, method, config, challenge) {
    const requestUrl = new URL(targetUrl);
    const uri = `${requestUrl.pathname}${requestUrl.search}`;
    const realm = challenge.realm;
    const nonce = challenge.nonce;
    const qop = challenge.qop && challenge.qop.includes('auth') ? 'auth' : '';
    const opaque = challenge.opaque || '';
    const nc = '00000001';
    const cnonce = crypto.randomBytes(8).toString('hex');
    const ha1 = md5(`${config.username}:${realm}:${config.password}`);
    const ha2 = md5(`${String(method || 'GET').toUpperCase()}:${uri}`);
    const response = qop
        ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
        : md5(`${ha1}:${nonce}:${ha2}`);

    const parts = [
        `Digest username="${config.username}"`,
        `realm="${realm}"`,
        `nonce="${nonce}"`,
        `uri="${uri}"`,
        `response="${response}"`,
    ];

    if (opaque) parts.push(`opaque="${opaque}"`);
    if (challenge.algorithm) parts.push(`algorithm=${challenge.algorithm}`);
    if (qop) {
        parts.push(`qop=${qop}`);
        parts.push(`nc=${nc}`);
        parts.push(`cnonce="${cnonce}"`);
    }

    return parts.join(', ');
}

function buildProxyRequest(config) {
    const headers = {
        Accept: '*/*',
        'User-Agent': 'datacenter-dashboard-face-recognition',
    };

    if ((config.authType === 'basic' || config.authType === 'auto') && config.username && config.password) {
        return {
            headers,
            auth: {
                username: config.username,
                password: config.password,
            },
        };
    }

    if (config.authType === 'bearer' && config.bearerToken) {
        headers.Authorization = `Bearer ${config.bearerToken}`;
    }

    return { headers };
}

function uniquePaths(paths) {
    return [...new Set(paths.filter(Boolean))];
}

function buildSnapshotCandidatePaths(config) {
    const pathCandidates = uniquePaths([
        config.path,
        ...config.fallbackPaths,
    ]);

    const snapshotPreferred = pathCandidates.filter((candidate) => /snapshot|webcapture|cgi-bin\/mjpg\/video\.cgi/i.test(candidate));
    const otherPaths = pathCandidates.filter((candidate) => !snapshotPreferred.includes(candidate));
    return uniquePaths([...snapshotPreferred, ...otherPaths]);
}

async function requestCameraSnapshot(targetUrl, config) {
    const baseRequest = {
        method: 'GET',
        url: targetUrl,
        responseType: 'arraybuffer',
        timeout: config.timeoutMs,
        maxRedirects: 5,
        validateStatus: () => true,
        httpsAgent: new https.Agent({ rejectUnauthorized: config.verifyTls }),
        ...buildProxyRequest(config),
    };

    let response = await axios(baseRequest);
    const digestHeader = response.headers['www-authenticate'];
    const digestChallenge = parseDigestChallenge(Array.isArray(digestHeader) ? digestHeader[0] : digestHeader);
    const shouldRetryDigest = (
        response.status === 401 &&
        digestChallenge &&
        config.username &&
        config.password &&
        (config.authType === 'digest' || config.authType === 'auto' || config.authType === 'basic')
    );

    if (!shouldRetryDigest) {
        return response;
    }

    const digestAuthorization = buildDigestAuthorizationHeader(targetUrl, 'GET', config, digestChallenge);
    response = await axios({
        ...baseRequest,
        auth: undefined,
        headers: {
            ...(baseRequest.headers || {}),
            Authorization: digestAuthorization,
        },
    });

    return response;
}

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

async function fetchLocalHlsFrame() {
    const outputDir = path.resolve(
        __dirname,
        '..',
        process.env.CAMERA_SERVER_ROOM_HLS_OUTPUT_DIR || 'runtime/camera-hls/server-room'
    );
    const playlistPath = path.join(outputDir, 'index.m3u8');

    try {
        const content = await fs.readFile(playlistPath, 'utf8');
        const segments = content.split('\n').filter(line => line.endsWith('.ts'));
        if (!segments.length) {
            throw new Error('No HLS segments available yet');
        }

        const latestSegment = path.join(outputDir, segments[segments.length - 1]);
        
        return new Promise((resolve, reject) => {
            const ffmpegPath = process.env.CAMERA_SERVER_ROOM_FFMPEG_PATH || 'ffmpeg';
            // Extract one frame from the segment
            const child = spawn(ffmpegPath, [
                '-i', latestSegment,
                '-frames:v', '1',
                '-f', 'image2',
                '-vcodec', 'mjpeg',
                'pipe:1'
            ]);

            const chunks = [];
            child.stdout.on('data', (chunk) => chunks.push(chunk));
            child.on('close', (code) => {
                if (code === 0) {
                    resolve({
                        buffer: Buffer.concat(chunks),
                        contentType: 'image/jpeg',
                        sourceUrl: 'local-hls-webcam',
                        requestedPath: latestSegment
                    });
                } else {
                    reject(new Error(`FFmpeg exited with code ${code} while extracting frame`));
                }
            });
            child.on('error', reject);
        });
    } catch (err) {
        throw new Error(`Failed to extract local HLS frame: ${err.message}`);
    }
}

async function fetchServerRoomSnapshotBuffer() {
    if (String(process.env.CAMERA_USE_WEBCAM || 'false').toLowerCase() === 'true') {
        return fetchLocalHlsFrame();
    }

    const config = getCameraConfig();
    const attempted = [];

    if (!config.baseUrl) {
        throw new Error('Camera base URL is not configured');
    }

    for (const candidatePath of buildSnapshotCandidatePaths(config)) {
        const normalizedPath = candidatePath.startsWith('/') ? candidatePath : `/${candidatePath}`;
        const targetUrl = `${config.baseUrl}${normalizedPath}`;
        attempted.push(targetUrl);

        try {
            const response = await requestCameraSnapshot(targetUrl, config);
            const contentType = String(response.headers['content-type'] || '').toLowerCase();
            const isHtml = contentType.includes('text/html');
            const isMultipartStream = contentType.includes('multipart/');

            if (response.status >= 400 || isHtml || isMultipartStream) {
                continue;
            }

            return {
                buffer: Buffer.from(response.data),
                contentType,
                sourceUrl: targetUrl,
                requestedPath: normalizedPath,
            };
        } catch (error) {
            console.warn(`[Camera Snapshot] Failed attempt for ${targetUrl}:`, error.message);
            continue;
        }
    }

    throw new Error(`Unable to capture a still frame from the camera. Tried: ${attempted.join(' | ')}`);
}

module.exports = {
    fetchServerRoomSnapshotBuffer,
    getCameraConfig,
};
