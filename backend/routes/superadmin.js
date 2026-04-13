const express = require('express');
const { getSuperAdminBundle, getSuperAdminDashboardData, getSuperAdminSectionDetails, isDbConfigured } = require('../db');
const { requireRole } = require('../auth');
const { getArchivedBundle, getArchivedSectionDetails, getArchiveWindowMode } = require('../services/archiveService');
const { ensureFreshSnapshot } = require('../services/metricsStoreService');

const router = express.Router();

router.use(requireRole('superadmin'));

function mergeDetailResponses(archiveDetails, liveDetails, filters) {
    const sortDirection = String(filters.sort || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const page = Number(filters.page || 1);
    const pageSize = Number(filters.pageSize || 50);
    const combinedRows = [...(archiveDetails?.rows || []), ...(liveDetails?.rows || [])].sort((left, right) => {
        const leftTime = new Date(left.timestamp || 0).getTime();
        const rightTime = new Date(right.timestamp || 0).getTime();
        return sortDirection === 'asc' ? leftTime - rightTime : rightTime - leftTime;
    });
    const start = (page - 1) * pageSize;

    return {
        section: archiveDetails?.section || liveDetails?.section,
        title: archiveDetails?.title || liveDetails?.title,
        range: filters.range || archiveDetails?.range || liveDetails?.range || 'custom',
        sort: sortDirection,
        page,
        pageSize,
        total: combinedRows.length,
        columns: archiveDetails?.columns?.length ? archiveDetails.columns : (liveDetails?.columns || []),
        rows: combinedRows.slice(start, start + pageSize),
        source: 'hybrid',
    };
}

function mergeVmLifecycle(archiveLifecycle = [], liveLifecycle = []) {
    const grouped = new Map();

    [...archiveLifecycle, ...liveLifecycle].forEach((row) => {
        const current = grouped.get(row.statDate) || {
            statDate: row.statDate,
            createdCount: 0,
            deletedCount: 0,
            runningCount: 0,
            stoppedCount: 0,
        };

        current.createdCount += Number(row.createdCount || 0);
        current.deletedCount += Number(row.deletedCount || 0);
        current.runningCount += Number(row.runningCount || 0);
        current.stoppedCount += Number(row.stoppedCount || 0);
        grouped.set(row.statDate, current);
    });

    return Array.from(grouped.values()).sort((left, right) => left.statDate.localeCompare(right.statDate));
}

function mergeBundleResponses(archiveBundle, liveBundle) {
    return {
        ...(liveBundle || {}),
        charts: {
            ...(liveBundle?.charts || {}),
            vmLifecycle: mergeVmLifecycle(archiveBundle?.charts?.vmLifecycle || [], liveBundle?.charts?.vmLifecycle || []),
        },
        tables: {
            ...(liveBundle?.tables || {}),
            vmActivity: [...(archiveBundle?.tables?.vmActivity || []), ...(liveBundle?.tables?.vmActivity || [])].sort(
                (left, right) => new Date(left.ts || 0) - new Date(right.ts || 0)
            ),
        },
        source: 'hybrid',
    };
}

router.get('/bundle', async (req, res) => {
    try {
        if (!isDbConfigured()) {
            return res.status(503).json({ error: 'Database is not configured' });
        }

        await ensureFreshSnapshot();

        const archiveMode = getArchiveWindowMode(req.query || {});
        if (archiveMode === 'archive_only') {
            const archivedBundle = await getArchivedBundle(req.query || {});
            return res.json(archivedBundle);
        }

        if (archiveMode === 'hybrid') {
            const [archivedBundle, liveBundle] = await Promise.all([
                getArchivedBundle(req.query || {}),
                getSuperAdminBundle(req.query || {}),
            ]);
            return res.json(mergeBundleResponses(archivedBundle, liveBundle));
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

        await ensureFreshSnapshot();

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

        await ensureFreshSnapshot();

        const archiveMode = getArchiveWindowMode(req.query || {});
        if (archiveMode === 'archive_only') {
            const archivedDetails = await getArchivedSectionDetails(req.query || {});
            return res.json(archivedDetails);
        }

        if (archiveMode === 'hybrid') {
            const [archivedDetails, liveDetails] = await Promise.all([
                getArchivedSectionDetails(req.query || {}),
                getSuperAdminSectionDetails(req.query || {}),
            ]);
            return res.json(mergeDetailResponses(archivedDetails, liveDetails, req.query || {}));
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
        const params = new URLSearchParams({
            host_id: String(host_id),
            metric: String(metric),
            range: String(range),
        });
        const mlServiceUrl = `http://localhost:8000/predict?${params.toString()}`;
        
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
