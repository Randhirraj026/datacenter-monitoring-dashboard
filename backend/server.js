const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const express = require('express');
const cors = require('cors');

const { mountAuthRoutes, verifyToken } = require('./auth');
const { initDb, isDbConfigured } = require('./db');
const { startMetricsCollector } = require('./services/metricsStoreService');
const { startArchiveScheduler } = require('./schedulers/archiveScheduler');
const { startCameraWatchdog } = require('./services/cameraStreamService');
const { startFaceRecognitionWatchdog } = require('./services/faceRecognitionService');
const iloRoute = require('./routes/ilo');
const rduRoute = require('./routes/rdu');
const vsphereRoute = require('./routes/vsphere');
const superAdminRoute = require('./routes/superadmin');
const archiveRoute = require('./routes/archive');
const alertRoute = require('./routes/alertRoutes');
const biometricRoute = require('./routes/biometric');
const cameraRoute = require('./routes/camera');
const cameraHlsRoute = require('./routes/cameraHls');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: true,
    credentials: true
}));

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '25mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.JSON_BODY_LIMIT || '25mb' }));

mountAuthRoutes(app);

app.use('/api', (req, res, next) => {
    if (req.path === '/login') return next();
    if (req.path.startsWith('/camera/')) return next();
    verifyToken(req, res, next);
});

app.use('/api/ilo', iloRoute);
app.use('/api/rdu', rduRoute);
app.use('/api', vsphereRoute);
app.use('/api/superadmin', superAdminRoute);
app.use('/api/archive', archiveRoute);
app.use('/api/alerts', alertRoute);
app.use('/api/biometric', biometricRoute);
app.use('/api/camera', cameraHlsRoute);
app.use('/api/camera', cameraRoute);

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        server: 'DataCenter Dashboard',
        time: new Date().toISOString()
    });
});

app.use((err, req, res, next) => {
    console.error('[Server Error]', err.message);
    res.status(500).json({ error: err.message });
});

const server = app.listen(PORT, '0.0.0.0', async () => {
    try {
        await initDb();
        startMetricsCollector();
        startArchiveScheduler();
        startCameraWatchdog();
        startFaceRecognitionWatchdog();
    } catch (error) {
        console.error('[DB] Startup failed:', error.message);
    }

    console.log('\nDataCenter Dashboard running');
    console.log(`LAN Access : http://localhost:${PORT}`);
    console.log(`Port       : ${PORT}`);
    console.log(`Auth       : Login required (credentials in .env)`);
    console.log(`[DB] PostgreSQL : ${isDbConfigured() ? 'configured' : 'not configured'}`);
    console.log(`vCenter    : ${process.env.VCENTER_HOST || '-'}`);
});

server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`\n[Server] Port ${PORT} is already in use.`);
        console.error('[Server] Another backend instance is already running or another app is bound to the same port.');
        console.error('[Server] Stop the existing process or set PORT to a free value, then restart the backend.');
        process.exit(0);
    }

    console.error('[Server] Failed to start:', error.message);
    process.exit(1);
});

module.exports = app;
