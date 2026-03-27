'use strict';

/**
 * routes/ilo.js
 *
 * Exposes:
 *   GET /api/ilo/all        → full payload for all 3 iLO servers
 *   GET /api/ilo/status     → lightweight reachability check
 *   GET /api/ilo/:ip        → single server by IP
 */

const express          = require('express');
const router           = express.Router();
const { fetchAllILO, ILO_SERVERS } = require('../services/iloService');

// ── GET /api/ilo/all ──────────────────────────────────────────────
router.get('/all', async (req, res) => {
    try {
        const data = await fetchAllILO();
        res.json(data);
    } catch (err) {
        console.error('[Route /ilo/all]', err.message);
        // Still return a valid shape so the frontend doesn't crash
        res.status(500).json({
            servers: ILO_SERVERS.map(s => ({
                ip:        s.ip,
                reachable: false,
                error:     err.message,
            })),
            summary: {
                reachable:     0,
                total:         ILO_SERVERS.length,
                totalPowerKW:  0,
                avgInletTempC: null,
                timestamp:     new Date().toISOString(),
            },
        });
    }
});

// ── GET /api/ilo/status ───────────────────────────────────────────
// router.get('/status', async (req, res) => {
//     try {
//         const data = await fetchAllILO();
//         res.json({
//             reachable:  data.summary.reachable,
//             total:      data.summary.total,
//             timestamp:  data.summary.timestamp,
//             servers:    data.servers.map(s => ({
//                 ip:        s.ip,
//                 reachable: s.reachable,
//                 name:      s.serverName || null,
//                 health:    s.health     || null,
//                 error:     s.error      || null,
//             })),
//         });
//     } catch (err) {
//         res.status(500).json({ error: err.message });
//     }
// });

// ── GET /api/ilo/:ip  (single server) ────────────────────────────
// router.get('/:ip', async (req, res) => {
//     try {
//         const data   = await fetchAllILO();
//         const server = data.servers.find(s => s.ip === req.params.ip);
//         if (!server) {
//             return res.status(404).json({ error: `No iLO server with IP ${req.params.ip}` });
//         }
//         res.json(server);
//     } catch (err) {
//         res.status(500).json({ error: err.message });
//     }
// });

module.exports = router;