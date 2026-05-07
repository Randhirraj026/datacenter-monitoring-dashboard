const express = require('express');
const axios = require('axios');
const https = require('https');
const crypto = require('crypto');

const router = express.Router();

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

function buildProxyRequest(req, config) {
    const headers = {
        Accept: req.headers.accept || '*/*',
        'User-Agent': req.headers['user-agent'] || 'datacenter-dashboard-camera-proxy',
    };

    if (req.headers['content-type']) {
        headers['Content-Type'] = req.headers['content-type'];
    }

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

function buildForwardedPath(req, config) {
    const routePath = String(req.path || '/').trim();
    const normalizedRoutePath = !routePath || routePath === '/' ? '' : routePath;
    const basePath = normalizedRoutePath || config.path || '/';

    const forwardedQuery = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query || {})) {
        if (key === 'access_token' || key === 'ts') continue;

        if (Array.isArray(value)) {
            for (const item of value) {
                forwardedQuery.append(key, String(item));
            }
        } else if (value != null) {
            forwardedQuery.append(key, String(value));
        }
    }

    const queryText = forwardedQuery.toString();
    return queryText ? `${basePath}${basePath.includes('?') ? '&' : '?'}${queryText}` : basePath;
}

async function requestCameraPath(targetUrl, req, config) {
    const baseRequest = {
        method: req.method,
        url: targetUrl,
        responseType: 'stream',
        timeout: config.timeoutMs,
        maxRedirects: 5,
        validateStatus: () => true,
        httpsAgent: new https.Agent({ rejectUnauthorized: config.verifyTls }),
        ...buildProxyRequest(req, config),
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

    if (response.data?.resume) {
        response.data.resume();
    }

    const digestAuthorization = buildDigestAuthorizationHeader(targetUrl, req.method, config, digestChallenge);
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

router.use('/server-room', async (req, res) => {
    const config = getCameraConfig();
    const incomingPath = buildForwardedPath(req, config);
    const requestedPath = incomingPath.startsWith('/') ? incomingPath : `/${incomingPath}`;
    const candidatePaths = [requestedPath];

    if (requestedPath === '/' || requestedPath === config.path || requestedPath.startsWith(`${config.path}?`) || requestedPath.startsWith(`${config.path}&`)) {
        for (const candidate of [config.path, ...config.fallbackPaths]) {
            const normalized = candidate.startsWith('/') ? candidate : `/${candidate}`;
            if (!candidatePaths.includes(normalized)) {
                candidatePaths.push(normalized);
            }
        }
    }

    try {
        let response = null;
        let lastHtmlResponse = false;
        let lastTargetUrl = '';
        const attemptedStatuses = [];

        for (const candidatePath of candidatePaths) {
            const targetUrl = `${config.baseUrl}${candidatePath}`;
            lastTargetUrl = targetUrl;
            const candidateResponse = await requestCameraPath(targetUrl, req, config);
            const contentType = String(candidateResponse.headers['content-type'] || '').toLowerCase();
            const isHtml = contentType.includes('text/html');
            attemptedStatuses.push(`${targetUrl} -> ${candidateResponse.status}${isHtml ? ' (html)' : ''}`);

            if (candidateResponse.status >= 400) {
                if (candidateResponse.data?.resume) {
                    candidateResponse.data.resume();
                }
                continue;
            }

            if (isHtml) {
                lastHtmlResponse = true;
                if (candidateResponse.data?.resume) {
                    candidateResponse.data.resume();
                }
                continue;
            }

            response = candidateResponse;
            break;
        }

        if (!response) {
            return res.status(502).json({
                error: lastHtmlResponse
                    ? `Camera returned an HTML login page for all configured paths. Tried: ${attemptedStatuses.join(' | ')}`
                    : `Camera stream request failed for configured paths. Tried: ${attemptedStatuses.join(' | ')}`,
            });
        }

        if (response.headers['content-type']) {
            res.setHeader('Content-Type', response.headers['content-type']);
        }

        if (response.headers['content-length']) {
            res.setHeader('Content-Length', response.headers['content-length']);
        }

        if (response.headers['cache-control']) {
            res.setHeader('Cache-Control', response.headers['cache-control']);
        }

        response.data.on('error', (streamError) => {
            console.error('[Route /camera/server-room]', streamError.message);
            if (!res.headersSent) {
                res.status(502).end('Camera stream interrupted');
            } else {
                res.end();
            }
        });

        return response.data.pipe(res);
    } catch (error) {
        console.error('[Route /camera/server-room]', error.message);
        return res.status(502).json({
            error: error.message || 'Unable to load camera feed',
        });
    }
});

module.exports = router;
