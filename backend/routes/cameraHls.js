const express = require('express');
const fs = require('fs');
const path = require('path');

const {
    ensureServerRoomHlsStream,
    getServerRoomHlsStatus,
    getServerRoomHlsConfig,
} = require('../services/cameraStreamService');
const { getFaceRecognitionStatus } = require('../services/faceRecognitionService');

const router = express.Router();

router.get('/server-room/live/status', (req, res) => {
    const status = ensureServerRoomHlsStream();
    const config = getServerRoomHlsConfig();
    const recognition = getFaceRecognitionStatus();

    return res.json({
        ...status,
        playlistUrl: status.ready ? '/api/camera/server-room/live/index.m3u8' : '',
        streamMode: status.ready ? 'hls' : 'mjpeg',
        rtspConfigured: Boolean(config.rtspUrl),
        recognition,
    });
});

router.get('/server-room/live/index.m3u8', (req, res) => {
    const status = ensureServerRoomHlsStream();
    const config = getServerRoomHlsConfig();

    if (!status.enabled) {
        return res.status(503).json({ error: 'HLS streaming is disabled in server configuration.' });
    }

    if (!status.configured) {
        return res.status(503).json({ error: 'RTSP camera URL is not configured for HLS streaming.' });
    }

    if (!status.ffmpegAvailable) {
        return res.status(503).json({ error: 'ffmpeg is not installed or not available on the server path.' });
    }

    if (!status.ready) {
        return res.status(503).json({
            error: status.lastError || 'HLS playlist is still being generated. Please retry shortly.',
        });
    }

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    return res.sendFile(path.resolve(config.playlistPath));
});

router.get('/server-room/live/:fileName', (req, res) => {
    const status = getServerRoomHlsStatus();
    const config = getServerRoomHlsConfig();
    const fileName = path.basename(String(req.params.fileName || ''));
    const filePath = path.join(config.outputDir, fileName);

    if (!status.ready) {
        return res.status(404).json({ error: 'Requested HLS segment is not ready yet.' });
    }

    if (!filePath.startsWith(config.outputDir)) {
        return res.status(400).json({ error: 'Invalid segment path.' });
    }

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Requested HLS segment was not found.' });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.sendFile(path.resolve(filePath));
});

module.exports = router;
