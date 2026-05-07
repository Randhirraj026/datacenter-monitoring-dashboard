const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function isTruthy(value) {
    return String(value || '').toLowerCase() === 'true';
}

const streamState = {
    process: null,
    startedAt: '',
    lastError: '',
    lastExitCode: null,
    ffmpegAvailable: true,
};

function getOutputDir() {
    return path.resolve(
        __dirname,
        '..',
        process.env.CAMERA_SERVER_ROOM_HLS_OUTPUT_DIR || 'runtime/camera-hls/server-room'
    );
}

function getPlaylistPath() {
    return path.join(getOutputDir(), 'index.m3u8');
}

function getSegmentPattern() {
    return path.join(getOutputDir(), 'segment_%03d.ts');
}

function getRtspUrl() {
    const explicitRtspUrl = String(process.env.CAMERA_SERVER_ROOM_RTSP_URL || '').trim();
    if (explicitRtspUrl) return explicitRtspUrl;

    const baseUrl = String(process.env.CAMERA_SERVER_ROOM_BASE_URL || '').trim();
    if (!baseUrl) return '';

    try {
        const parsed = new URL(baseUrl);
        const hostname = parsed.hostname;
        const port = process.env.CAMERA_SERVER_ROOM_RTSP_PORT || '554';
        const username = encodeURIComponent(String(process.env.CAMERA_SERVER_ROOM_USERNAME || '').trim());
        const password = encodeURIComponent(String(process.env.CAMERA_SERVER_ROOM_PASSWORD || '').trim());
        const credentials = username && password ? `${username}:${password}@` : '';
        const rtspPath = String(
            process.env.CAMERA_SERVER_ROOM_RTSP_PATH ||
            '/cam/realmonitor?channel=1&subtype=0'
        ).trim();

        const normalizedRtspPath = rtspPath.startsWith('/') ? rtspPath : `/${rtspPath}`;
        const finalUrl = `rtsp://${credentials}${hostname}:${port}${normalizedRtspPath}`;
        console.log('[CameraStream] Built RTSP URL:', finalUrl.replace(password, '******'));
        return finalUrl;
    } catch (error) {
        console.error('[CameraStream] Error building RTSP URL:', error.message);
        return '';
    }
}

function getHlsConfig() {
    return {
        enabled: isTruthy(process.env.CAMERA_SERVER_ROOM_HLS_ENABLED || 'true'),
        useWebcam: String(process.env.CAMERA_USE_WEBCAM || 'false').toLowerCase() === 'true',
        ffmpegPath: String(process.env.CAMERA_SERVER_ROOM_FFMPEG_PATH || 'ffmpeg').trim(),
        rtspUrl: getRtspUrl(),
        outputDir: getOutputDir(),
        playlistPath: getPlaylistPath(),
        segmentPattern: getSegmentPattern(),
        segmentTime: Number.parseInt(process.env.CAMERA_SERVER_ROOM_HLS_SEGMENT_SECONDS || '2', 10),
        listSize: Number.parseInt(process.env.CAMERA_SERVER_ROOM_HLS_LIST_SIZE || '6', 10),
        videoBitrate: String(process.env.CAMERA_SERVER_ROOM_HLS_VIDEO_BITRATE || '2500k').trim(),
        maxRate: String(process.env.CAMERA_SERVER_ROOM_HLS_MAX_RATE || '3000k').trim(),
        bufferSize: String(process.env.CAMERA_SERVER_ROOM_HLS_BUFFER_SIZE || '6000k').trim(),
        width: Number.parseInt(process.env.CAMERA_SERVER_ROOM_HLS_WIDTH || '', 10),
        height: Number.parseInt(process.env.CAMERA_SERVER_ROOM_HLS_HEIGHT || '', 10),
    };
}

function clearOutputDir(outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });

    for (const entry of fs.readdirSync(outputDir, { withFileTypes: true })) {
        if (entry.isFile() && (entry.name.endsWith('.m3u8') || entry.name.endsWith('.ts'))) {
            fs.unlinkSync(path.join(outputDir, entry.name));
        }
    }
}

function buildFfmpegArgs(config) {
    const useWebcam = String(process.env.CAMERA_USE_WEBCAM || 'false').toLowerCase() === 'true';
    const webcamName = process.env.CAMERA_WEBCAM_NAME || 'Integrated Webcam';
    const shouldScale = Number.isFinite(config.width) && config.width > 0 && Number.isFinite(config.height) && config.height > 0;
    
    const inputArgs = useWebcam 
        ? ['-f', 'dshow', '-i', `video=${webcamName}`]
        : ['-rtsp_transport', 'tcp', '-fflags', 'nobuffer', '-flags', 'low_delay', '-i', config.rtspUrl];

    const args = [
        '-hide_banner',
        '-loglevel',
        'warning',
        ...inputArgs,
        '-an',
        '-c:v',
        'libx264',
        '-profile:v',
        'high',
        '-level',
        '4.1',
        '-preset',
        'veryfast',
        '-tune',
        'zerolatency',
        '-pix_fmt',
        'yuv420p',
        '-crf',
        '20',
        '-maxrate',
        '5000k',
        '-bufsize',
        '10000k',
        '-g',
        '50',
        '-sc_threshold',
        '0',
        '-f',
        'hls',
        '-hls_time',
        '1',
        '-hls_list_size',
        '3',
        '-hls_flags',
        'delete_segments+append_list+omit_endlist',
        '-hls_segment_filename',
        config.segmentPattern.replace(/\\/g, '/'),
        config.playlistPath.replace(/\\/g, '/'),
    ];

    if (shouldScale) {
        // Find index of -i and insert -vf after its value
        const inputIndex = args.indexOf('-i');
        if (inputIndex !== -1) {
            args.splice(inputIndex + 2, 0,
                '-vf',
                `scale='min(${config.width},iw)':'min(${config.height},ih)':force_original_aspect_ratio=decrease`
            );
        }
    }

    return args;
}

function stopServerRoomHlsStream() {
    if (streamState.process) {
        streamState.process.kill('SIGTERM');
        streamState.process = null;
    }
}

function ensureServerRoomHlsStream() {
    const config = getHlsConfig();
    console.log('[CameraStream] ensureServerRoomHlsStream. Enabled:', config.enabled, 'Webcam:', config.useWebcam, 'RTSP:', !!config.rtspUrl);
    
    if (!config.enabled) {
        return getServerRoomHlsStatus();
    }

    if (!config.useWebcam && !config.rtspUrl) {
        console.warn('[CameraStream] No input source (Webcam or RTSP) available');
        streamState.lastError = 'RTSP URL is not configured. Set CAMERA_SERVER_ROOM_RTSP_URL or CAMERA_SERVER_ROOM_RTSP_PATH.';
        return getServerRoomHlsStatus();
    }

    if (streamState.process && !streamState.process.killed) {
        return getServerRoomHlsStatus();
    }

    console.log('[CameraStream] Initializing HLS stream. Webcam:', config.useWebcam);
    clearOutputDir(config.outputDir);
    streamState.lastError = '';
    streamState.lastExitCode = null;
    streamState.ffmpegAvailable = true;

    const args = buildFfmpegArgs(config);
    console.log('[CameraStream] Spawning FFmpeg:', config.ffmpegPath, args.join(' '));

    const child = spawn(config.ffmpegPath, args, {
        stdio: ['ignore', 'ignore', 'pipe'],
    });

    streamState.process = child;
    streamState.startedAt = new Date().toISOString();

    child.stderr.on('data', (chunk) => {
        const message = String(chunk || '').trim();
        if (message) {
            streamState.lastError = message;
        }
    });

    child.on('error', (error) => {
        streamState.lastError = error.message || 'Unable to start ffmpeg';
        streamState.ffmpegAvailable = false;
        streamState.process = null;
    });

    child.on('exit', (code) => {
        streamState.lastExitCode = code;
        streamState.process = null;
    });

    return getServerRoomHlsStatus();
}

function getServerRoomHlsStatus() {
    const config = getHlsConfig();
    const playlistExists = fs.existsSync(config.playlistPath);

    return {
        enabled: config.enabled,
        configured: Boolean(config.rtspUrl),
        running: Boolean(streamState.process && !streamState.process.killed),
        ready: playlistExists,
        ffmpegAvailable: streamState.ffmpegAvailable,
        startedAt: streamState.startedAt,
        lastExitCode: streamState.lastExitCode,
        lastError: streamState.lastError,
        playlistPath: config.playlistPath,
        outputDir: config.outputDir,
    };
}

let watchdogInterval = null;

function startCameraWatchdog() {
    if (watchdogInterval) return;

    console.log('[CameraStream] Starting background watchdog...');
    watchdogInterval = setInterval(() => {
        ensureServerRoomHlsStream();
    }, 30000);

    // Initial start
    ensureServerRoomHlsStream();
}

module.exports = {
    ensureServerRoomHlsStream,
    getServerRoomHlsStatus,
    getServerRoomHlsConfig: getHlsConfig,
    stopServerRoomHlsStream,
    startCameraWatchdog,
};
