'use strict';

const express = require('express');
const router = express.Router();
const { fetchRduSummary } = require('../services/rduService');

router.get('/summary', async (req, res) => {
    const includeRaw = String(req.query.includeRaw || '').toLowerCase() === 'true';
    const forceRefresh = String(req.query.refresh || '').toLowerCase() === 'true';
    const data = await fetchRduSummary({ includeRaw, forceRefresh });
    res.status(data.ok === false && !data.disabled ? 502 : 200).json(data);
});

module.exports = router;
