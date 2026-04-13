const nodemailer = require('nodemailer');
const { getSmtpSettingsWithSecret, normalizeEmailList } = require('../db/alertSettings');

function formatDashboardTimestamp(date = new Date()) {
    const timezone = process.env.APP_TIMEZONE || process.env.TZ || 'Asia/Kolkata';
    const formatter = new Intl.DateTimeFormat('en-IN', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });

    return `${formatter.format(date)} (${timezone})`;
}

function getRecipients(settings = {}) {
    return {
        to: normalizeEmailList(settings.alertRecipientEmails),
        cc: normalizeEmailList(settings.ccEmails),
        bcc: normalizeEmailList(settings.bccEmails),
    };
}

async function buildTransportContext() {
    const settings = await getSmtpSettingsWithSecret();

    if (!settings?.smtpHost || !settings.smtpPort || !settings.senderEmail) {
        throw new Error('SMTP settings are incomplete');
    }

    const recipients = getRecipients(settings);
    if (!recipients.to.length && !settings.senderEmail) {
        throw new Error('At least one recipient email is required');
    }

    const port = Number(settings.smtpPort);
    const tlsEnabled = Boolean(settings.sslEnabled);
    const useImplicitTls = tlsEnabled && port === 465;
    const useStartTls = tlsEnabled && port !== 465;

    const transporter = nodemailer.createTransport({
        host: settings.smtpHost,
        port,
        secure: useImplicitTls,
        requireTLS: useStartTls,
        auth: settings.smtpUser
            ? {
                user: settings.smtpUser,
                pass: settings.smtpPassword || '',
            }
            : undefined,
        tls: {
            rejectUnauthorized: false,
        },
    });

    return { transporter, settings, recipients };
}

async function sendMail(message = {}) {
    const { transporter, settings, recipients } = await buildTransportContext();
    const info = await transporter.sendMail({
        from: settings.senderName
            ? `"${settings.senderName}" <${settings.senderEmail}>`
            : settings.senderEmail,
        to: normalizeEmailList(message.to).length ? normalizeEmailList(message.to) : recipients.to,
        cc: normalizeEmailList(message.cc).length ? normalizeEmailList(message.cc) : recipients.cc,
        bcc: normalizeEmailList(message.bcc).length ? normalizeEmailList(message.bcc) : recipients.bcc,
        subject: message.subject,
        text: message.text,
        html: message.html,
    });

    return info;
}

async function sendTestEmail() {
    const now = formatDashboardTimestamp(new Date());
    return sendMail({
        subject: 'Test Email - Data Center Dashboard SMTP Configuration',
        text: [
            'This is a test email from the Data Center Dashboard.',
            `Timestamp: ${now}`,
            'SMTP configuration is working successfully.',
        ].join('\n'),
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                <h2 style="margin-bottom: 12px;">SMTP Test Email</h2>
                <p>This is a test email from the Data Center Dashboard.</p>
                <p><strong>Timestamp:</strong> ${now}</p>
                <p>SMTP configuration is working successfully.</p>
            </div>
        `,
    });
}

module.exports = {
    sendMail,
    sendTestEmail,
    formatDashboardTimestamp,
};
