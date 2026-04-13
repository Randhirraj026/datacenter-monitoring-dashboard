'use strict';

/**
 * routes/vsphere.js
 *
 * All endpoints consumed by the frontend fetchAll():
 *   GET /api/datacenter/realtime
 *   GET /api/hosts
 *   GET /api/vms
 *   GET /api/datastores
 *   GET /api/alerts
 *   GET /api/networks
 */

const express = require('express');
const router  = express.Router();

const {
    getRealtime,
    getHosts,
    getVMs,
    getDatastores,
    getAlerts,
    getNetworks,
} = require('../services/vsphereService');

const { getRecentPowerHistory, FIVE_MINUTES_MS } = require('../db');
const { ensureFreshSnapshot } = require('../services/metricsStoreService');

// ── Wrapper: catch errors, always return valid JSON ───────────────
function handle(fn) {
    return async (req, res) => {
        try {
            const data = await fn();
            res.json(data);
        } catch (err) {
            console.error(`[Route ${req.path}]`, err.message);
            res.status(500).json({ error: err.message });
        }
    };
}

router.get('/datacenter/realtime', handle(getRealtime));
router.get('/datacenter/power/history', handle(getRecentPowerHistory));
router.get('/hosts',               handle(getHosts));
router.get('/vms',                 handle(async () => {
    const data = await getVMs({ forceRefresh: true });

    // Keep DB-backed alerts and superadmin inventory close to the admin page's live polling loop.
    ensureFreshSnapshot(FIVE_MINUTES_MS).catch((error) => {
        console.error('[Route /vms][snapshot]', error.message);
    });

    return data;
}));
router.get('/datastores',          handle(getDatastores));
router.get('/alerts',              handle(getAlerts));
router.get('/networks',            handle(getNetworks));

module.exports = router;
