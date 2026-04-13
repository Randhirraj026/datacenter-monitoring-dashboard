const express = require('express');

const { requireRole } = require('../auth');
const { listArchiveFolders, getArchiveTableData } = require('../services/archiveService');

const router = express.Router();

router.use(requireRole('superadmin'));

router.get('/list', async (_req, res) => {
    try {
        const folders = await listArchiveFolders();
        return res.json({ folders });
    } catch (error) {
        console.error('[Route /archive/list]', error.message);
        return res.status(500).json({ error: error.message });
    }
});

router.get('/:folder/:table', async (req, res) => {
    try {
        const data = await getArchiveTableData(req.params.folder, req.params.table, {
            customFrom: req.query.customFrom,
            customTo: req.query.customTo,
        });
        return res.json(data);
    } catch (error) {
        console.error('[Route /archive/:folder/:table]', error.message);
        return res.status(404).json({ error: error.message });
    }
});

module.exports = router;
