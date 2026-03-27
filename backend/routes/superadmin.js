const express = require('express');
const { getSuperAdminBundle, getSuperAdminDashboardData, getSuperAdminSectionDetails, isDbConfigured } = require('../db');
const { requireRole } = require('../auth');

const router = express.Router();

router.use(requireRole('superadmin'));

router.get('/bundle', async (req, res) => {
    try {
        if (!isDbConfigured()) {
            return res.status(503).json({ error: 'Database is not configured' });
        }

        const bundle = await getSuperAdminBundle(req.query || {});
        return res.json(bundle);
    } catch (error) {
        console.error('[Route /superadmin/bundle]', error.message);
        return res.status(500).json({ error: error.message });
    }
});

router.get('/dashboard', async (_req, res) => {
    try {
        if (!isDbConfigured()) {
            return res.status(503).json({ error: 'Database is not configured' });
        }

        const snapshot = await getSuperAdminDashboardData();
        return res.json(snapshot);
    } catch (error) {
        console.error('[Route /superadmin/dashboard]', error.message);
        return res.status(500).json({ error: error.message });
    }
});

router.get('/details', async (req, res) => {
    try {
        if (!isDbConfigured()) {
            return res.status(503).json({ error: 'Database is not configured' });
        }

        const details = await getSuperAdminSectionDetails(req.query || {});
        return res.json(details);
    } catch (error) {
        console.error('[Route /superadmin/details]', error.message);
        return res.status(500).json({ error: error.message });
    }
});

router.get('/predict', async (req, res) => {
    try {
        const { host_id, metric, range } = req.query;
        if (!host_id || !metric || !range) {
            return res.status(400).json({ error: 'Missing required query parameters' });
        }

        // Forward request to Python ML service
        const mlServiceUrl = `http://localhost:8000/predict?host_id=${host_id}&metric=${metric}&range=${range}`;
        
        const response = await fetch(mlServiceUrl);
        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`ML service error: ${response.status} ${errorData}`);
        }

        const data = await response.json();
        return res.json(data);
    } catch (error) {
        console.error('[Route /superadmin/predict]', error.message);
        return res.status(500).json({ error: error.message });
    }
});

module.exports = router;
