const {
    getAlertConfiguration,
    saveSmtpSettings,
    saveAlertRules,
} = require('../db/alertSettings');
const { sendTestEmail } = require('../services/mailService');

async function getAlertConfigurationHandler(_req, res) {
    try {
        const configuration = await getAlertConfiguration();
        return res.json(configuration);
    } catch (error) {
        console.error('[AlertController][getConfig]', error.message);
        return res.status(500).json({ error: error.message });
    }
}

async function saveSmtpSettingsHandler(req, res) {
    try {
        const smtpSettings = await saveSmtpSettings(req.body || {});
        return res.json({
            message: 'SMTP configuration saved successfully',
            smtpSettings,
        });
    } catch (error) {
        console.error('[AlertController][saveSmtp]', error.message);
        return res.status(500).json({ error: error.message });
    }
}

async function saveAlertRulesHandler(req, res) {
    try {
        const alertRules = await saveAlertRules(req.body || {});
        return res.json({
            message: 'Alert rules saved successfully',
            alertRules,
        });
    } catch (error) {
        console.error('[AlertController][saveRules]', error.message);
        return res.status(500).json({ error: error.message });
    }
}

async function sendTestEmailHandler(_req, res) {
    try {
        const info = await sendTestEmail();
        return res.json({
            message: 'Test email sent successfully',
            envelope: info.envelope,
            messageId: info.messageId,
        });
    } catch (error) {
        console.error('[AlertController][testEmail]', error.message);
        return res.status(500).json({ error: error.message });
    }
}

module.exports = {
    getAlertConfigurationHandler,
    saveSmtpSettingsHandler,
    saveAlertRulesHandler,
    sendTestEmailHandler,
};
