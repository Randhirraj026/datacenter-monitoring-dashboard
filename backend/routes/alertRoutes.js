const express = require('express');
const { requireRole } = require('../auth');
const {
    getAlertConfigurationHandler,
    saveSmtpSettingsHandler,
    saveAlertRulesHandler,
    sendTestEmailHandler,
} = require('../controllers/alertController');

const router = express.Router();

router.use(requireRole('superadmin'));

router.get('/config', getAlertConfigurationHandler);
router.put('/smtp-settings', saveSmtpSettingsHandler);
router.put('/rules', saveAlertRulesHandler);
router.post('/test-email', sendTestEmailHandler);

module.exports = router;
