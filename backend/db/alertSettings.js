const { pool, isDbConfigured } = require('./index');
const { encryptValue, decryptValue } = require('../utils/cryptoUtil');

const DEFAULT_RULES = {
    cpuUsageThreshold: 85,
    memoryUsageThreshold: 85,
    diskUsageThreshold: 90,
    temperatureThreshold: 35,
    powerFailureAlertEnabled: true,
    vmAddedAlertEnabled: true,
    vmRemovedAlertEnabled: true,
    vmPowerAlertEnabled: true,
    hostDownAlertEnabled: true,
    rduAlertEnabled: true,
    dashboardParameterChangeEnabled: true,
};

function normalizeEmailList(value) {
    if (Array.isArray(value)) {
        return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
    }

    return [...new Set(
        String(value || '')
            .split(/[\n,;]+/)
            .map((item) => item.trim())
            .filter(Boolean)
    )];
}

function mapSmtpRow(row) {
    if (!row) {
        return {
            smtpHost: '',
            smtpPort: 587,
            smtpUser: '',
            smtpPassword: '',
            senderEmail: '',
            senderName: '',
            sslEnabled: true,
            alertsEnabled: true,
            alertRecipientEmails: [],
            ccEmails: [],
            bccEmails: [],
            hasPassword: false,
            updatedAt: null,
        };
    }

    return {
        smtpHost: row.smtp_host || '',
        smtpPort: Number(row.smtp_port || 587),
        smtpUser: row.smtp_user || '',
        smtpPassword: '',
        senderEmail: row.sender_email || '',
        senderName: row.sender_name || '',
        sslEnabled: Boolean(row.ssl_enabled),
        alertsEnabled: Boolean(row.alerts_enabled),
        alertRecipientEmails: row.alert_recipient_emails || [],
        ccEmails: row.cc_emails || [],
        bccEmails: row.bcc_emails || [],
        hasPassword: Boolean(row.smtp_password),
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    };
}

function mapRuleRow(row) {
    if (!row) {
        return {
            ...DEFAULT_RULES,
            updatedAt: null,
        };
    }

    return {
        cpuUsageThreshold: Number(row.cpu_usage_threshold ?? DEFAULT_RULES.cpuUsageThreshold),
        memoryUsageThreshold: Number(row.memory_usage_threshold ?? DEFAULT_RULES.memoryUsageThreshold),
        diskUsageThreshold: Number(row.disk_usage_threshold ?? DEFAULT_RULES.diskUsageThreshold),
        temperatureThreshold: Number(row.temperature_threshold ?? DEFAULT_RULES.temperatureThreshold),
        powerFailureAlertEnabled: Boolean(row.power_failure_alert_enabled),
        vmAddedAlertEnabled: Boolean(row.vm_added_alert_enabled),
        vmRemovedAlertEnabled: Boolean(row.vm_removed_alert_enabled),
        vmPowerAlertEnabled: Boolean(row.vm_power_alert_enabled),
        hostDownAlertEnabled: Boolean(row.host_down_alert_enabled),
        rduAlertEnabled: Boolean(row.rdu_alert_enabled),
        dashboardParameterChangeEnabled: Boolean(row.dashboard_parameter_change_enabled),
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    };
}

async function ensureDefaultRows(client = pool) {
    if (!isDbConfigured() || !client) return;

    await client.query(`
        INSERT INTO smtp_settings (
            id, smtp_host, smtp_port, smtp_user, smtp_password, sender_email, sender_name,
            ssl_enabled, alerts_enabled, alert_recipient_emails, cc_emails, bcc_emails
        )
        VALUES (
            1, '', 587, '', '', '', '',
            TRUE, TRUE, ARRAY[]::TEXT[], ARRAY[]::TEXT[], ARRAY[]::TEXT[]
        )
        ON CONFLICT (id) DO NOTHING
    `);

    await client.query(`
        INSERT INTO alert_rules (
            id, cpu_usage_threshold, memory_usage_threshold, disk_usage_threshold, temperature_threshold,
            power_failure_alert_enabled, vm_added_alert_enabled, vm_removed_alert_enabled, vm_power_alert_enabled,
            host_down_alert_enabled, rdu_alert_enabled, dashboard_parameter_change_enabled
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO NOTHING
    `, [
        1,
        DEFAULT_RULES.cpuUsageThreshold,
        DEFAULT_RULES.memoryUsageThreshold,
        DEFAULT_RULES.diskUsageThreshold,
        DEFAULT_RULES.temperatureThreshold,
        DEFAULT_RULES.powerFailureAlertEnabled,
        DEFAULT_RULES.vmAddedAlertEnabled,
        DEFAULT_RULES.vmRemovedAlertEnabled,
        DEFAULT_RULES.vmPowerAlertEnabled,
        DEFAULT_RULES.hostDownAlertEnabled,
        DEFAULT_RULES.rduAlertEnabled,
        DEFAULT_RULES.dashboardParameterChangeEnabled,
    ]);
}

async function getSmtpSettings() {
    if (!isDbConfigured() || !pool) return mapSmtpRow(null);

    await ensureDefaultRows();
    const result = await pool.query('SELECT * FROM smtp_settings WHERE id = 1');
    return mapSmtpRow(result.rows[0]);
}

async function getSmtpSettingsWithSecret() {
    if (!isDbConfigured() || !pool) return null;

    await ensureDefaultRows();
    const result = await pool.query('SELECT * FROM smtp_settings WHERE id = 1');
    const row = result.rows[0];
    if (!row) return null;

    return {
        ...mapSmtpRow(row),
        smtpPassword: row.smtp_password ? decryptValue(row.smtp_password) : '',
    };
}

async function saveSmtpSettings(payload = {}) {
    if (!isDbConfigured() || !pool) {
        throw new Error('Database is not configured');
    }

    await ensureDefaultRows();
    const smtpPassword = payload.smtpPassword
        ? encryptValue(payload.smtpPassword)
        : (await pool.query('SELECT smtp_password FROM smtp_settings WHERE id = 1')).rows[0]?.smtp_password || '';

    await pool.query(`
        INSERT INTO smtp_settings (
            id, smtp_host, smtp_port, smtp_user, smtp_password, sender_email, sender_name,
            ssl_enabled, alerts_enabled, alert_recipient_emails, cc_emails, bcc_emails, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::text[], $11::text[], $12::text[], now())
        ON CONFLICT (id)
        DO UPDATE SET
            smtp_host = EXCLUDED.smtp_host,
            smtp_port = EXCLUDED.smtp_port,
            smtp_user = EXCLUDED.smtp_user,
            smtp_password = EXCLUDED.smtp_password,
            sender_email = EXCLUDED.sender_email,
            sender_name = EXCLUDED.sender_name,
            ssl_enabled = EXCLUDED.ssl_enabled,
            alerts_enabled = EXCLUDED.alerts_enabled,
            alert_recipient_emails = EXCLUDED.alert_recipient_emails,
            cc_emails = EXCLUDED.cc_emails,
            bcc_emails = EXCLUDED.bcc_emails,
            updated_at = now()
    `, [
        1,
        String(payload.smtpHost || '').trim(),
        Number(payload.smtpPort || 587),
        String(payload.smtpUser || '').trim(),
        smtpPassword,
        String(payload.senderEmail || '').trim(),
        String(payload.senderName || '').trim(),
        Boolean(payload.sslEnabled),
        Boolean(payload.alertsEnabled),
        normalizeEmailList(payload.alertRecipientEmails),
        normalizeEmailList(payload.ccEmails),
        normalizeEmailList(payload.bccEmails),
    ]);

    return getSmtpSettings();
}

async function getAlertRules() {
    if (!isDbConfigured() || !pool) return mapRuleRow(null);

    await ensureDefaultRows();
    const result = await pool.query('SELECT * FROM alert_rules WHERE id = 1');
    return mapRuleRow(result.rows[0]);
}

async function saveAlertRules(payload = {}) {
    if (!isDbConfigured() || !pool) {
        throw new Error('Database is not configured');
    }

    await ensureDefaultRows();

    await pool.query(`
        INSERT INTO alert_rules (
            id, cpu_usage_threshold, memory_usage_threshold, disk_usage_threshold, temperature_threshold,
            power_failure_alert_enabled, vm_added_alert_enabled, vm_removed_alert_enabled, vm_power_alert_enabled,
            host_down_alert_enabled, rdu_alert_enabled, dashboard_parameter_change_enabled, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
        ON CONFLICT (id)
        DO UPDATE SET
            cpu_usage_threshold = EXCLUDED.cpu_usage_threshold,
            memory_usage_threshold = EXCLUDED.memory_usage_threshold,
            disk_usage_threshold = EXCLUDED.disk_usage_threshold,
            temperature_threshold = EXCLUDED.temperature_threshold,
            power_failure_alert_enabled = EXCLUDED.power_failure_alert_enabled,
            vm_added_alert_enabled = EXCLUDED.vm_added_alert_enabled,
            vm_removed_alert_enabled = EXCLUDED.vm_removed_alert_enabled,
            vm_power_alert_enabled = EXCLUDED.vm_power_alert_enabled,
            host_down_alert_enabled = EXCLUDED.host_down_alert_enabled,
            rdu_alert_enabled = EXCLUDED.rdu_alert_enabled,
            dashboard_parameter_change_enabled = EXCLUDED.dashboard_parameter_change_enabled,
            updated_at = now()
    `, [
        1,
        Number(payload.cpuUsageThreshold ?? DEFAULT_RULES.cpuUsageThreshold),
        Number(payload.memoryUsageThreshold ?? DEFAULT_RULES.memoryUsageThreshold),
        Number(payload.diskUsageThreshold ?? DEFAULT_RULES.diskUsageThreshold),
        Number(payload.temperatureThreshold ?? DEFAULT_RULES.temperatureThreshold),
        Boolean(payload.powerFailureAlertEnabled),
        Boolean(payload.vmAddedAlertEnabled),
        Boolean(payload.vmRemovedAlertEnabled),
        Boolean(payload.vmPowerAlertEnabled),
        Boolean(payload.hostDownAlertEnabled),
        Boolean(payload.rduAlertEnabled),
        Boolean(payload.dashboardParameterChangeEnabled),
    ]);

    return getAlertRules();
}

async function getAlertConfiguration() {
    const [smtpSettings, alertRules] = await Promise.all([
        getSmtpSettings(),
        getAlertRules(),
    ]);

    return { smtpSettings, alertRules };
}

async function getPreviousSnapshotState() {
    if (!isDbConfigured() || !pool) return null;

    const [hostResult, datastoreResult, vmResult, rduResult] = await Promise.all([
        pool.query(`
            SELECT DISTINCT ON (h.id)
                h.id,
                h.host_name,
                h.connection_state,
                h.power_state,
                hm.ts,
                hm.cpu_usage_pct,
                hm.memory_usage_pct,
                hm.temperature_c
            FROM hosts h
            LEFT JOIN host_metrics hm ON hm.host_id = h.id
            WHERE h.is_active = TRUE
            ORDER BY h.id, hm.ts DESC
        `),
        pool.query(`
            SELECT DISTINCT ON (d.id)
                d.id,
                d.datastore_name,
                dm.ts,
                dm.total_capacity_gb,
                dm.used_space_gb,
                dm.free_space_gb
            FROM datastores d
            LEFT JOIN datastore_metrics dm ON dm.datastore_id = d.id
            WHERE d.is_active = TRUE
            ORDER BY d.id, dm.ts DESC
        `),
        pool.query(`
            SELECT vm_name, status, host_id, cpu_count, memory_mib, last_host_name, last_power_state
            FROM virtual_machines
            WHERE is_deleted = FALSE
        `),
        pool.query(`
            SELECT ts, power_cut_active, mains_status, rdu_status, active_alarm_count, alerts, sensors
            FROM rdu_snapshots
            ORDER BY ts DESC
            LIMIT 1
        `),
    ]);

    return {
        hosts: hostResult.rows.map((row) => ({
            id: row.id,
            name: row.host_name,
            connectionState: row.connection_state,
            powerState: row.power_state,
            cpuUsagePercent: row.cpu_usage_pct != null ? Number(row.cpu_usage_pct) : 0,
            memoryUsagePercent: row.memory_usage_pct != null ? Number(row.memory_usage_pct) : 0,
            temperatureC: row.temperature_c != null ? Number(row.temperature_c) : null,
            timestamp: row.ts instanceof Date ? row.ts.toISOString() : row.ts,
        })),
        datastores: datastoreResult.rows.map((row) => ({
            id: row.id,
            name: row.datastore_name,
            capacityGB: row.total_capacity_gb != null ? Number(row.total_capacity_gb) : 0,
            usedSpaceGB: row.used_space_gb != null ? Number(row.used_space_gb) : 0,
            freeSpaceGB: row.free_space_gb != null ? Number(row.free_space_gb) : 0,
            usagePercent: row.total_capacity_gb > 0
                ? Number(((Number(row.used_space_gb || 0) / Number(row.total_capacity_gb)) * 100).toFixed(2))
                : 0,
            timestamp: row.ts instanceof Date ? row.ts.toISOString() : row.ts,
        })),
        vms: vmResult.rows.map((row) => ({
            name: row.vm_name,
            status: row.status,
            hostId: row.host_id,
            cpuCount: Number(row.cpu_count || 0),
            memoryMib: Number(row.memory_mib || 0),
            hostName: row.last_host_name || null,
            powerState: row.last_power_state || row.status,
        })),
        rdu: rduResult.rows[0]
            ? {
                timestamp: rduResult.rows[0].ts instanceof Date ? rduResult.rows[0].ts.toISOString() : rduResult.rows[0].ts,
                powerCutActive: rduResult.rows[0].power_cut_active,
                mainsStatus: rduResult.rows[0].mains_status,
                rduStatus: rduResult.rows[0].rdu_status,
                activeAlarmCount: Number(rduResult.rows[0].active_alarm_count || 0),
                alerts: Array.isArray(rduResult.rows[0].alerts) ? rduResult.rows[0].alerts : [],
                sensors: Array.isArray(rduResult.rows[0].sensors) ? rduResult.rows[0].sensors : [],
            }
            : null,
    };
}

module.exports = {
    DEFAULT_RULES,
    ensureDefaultRows,
    getSmtpSettings,
    getSmtpSettingsWithSecret,
    saveSmtpSettings,
    getAlertRules,
    saveAlertRules,
    getAlertConfiguration,
    getPreviousSnapshotState,
    normalizeEmailList,
};
