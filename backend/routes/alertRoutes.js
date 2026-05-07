const express = require('express');
const { requireRole } = require('../auth');
const {
    getAlertConfigurationHandler,
    saveSmtpSettingsHandler,
    saveAlertRulesHandler,
    sendTestEmailHandler,
    getRecentAlertsHandler,
} = require('../controllers/alertController');

const router = express.Router();

// Allow all authenticated roles to see recent alerts
router.get('/recent', getRecentAlertsHandler);

// Restrict configuration changes to superadmin only
router.use(requireRole('superadmin'));

router.get('/config', getAlertConfigurationHandler);
router.put('/smtp-settings', saveSmtpSettingsHandler);
router.put('/rules', saveAlertRulesHandler);
router.post('/test-email', sendTestEmailHandler);

module.exports = router;
