'use strict';


let mssql = null;

const DEFAULT_BASE_URL = 'http://10.10.10.68';
const DEFAULT_ALLOWED_EVENTS = ['SERVER IN', 'SERVER OUT'];
const DEFAULT_ALLOWED_SERIALS = ['00054', '00055'];

async function getBiometricEmployeesMap() {
    const { getPool } = require('../db');
    const pool = getPool();
    if (!pool) return {};

    try {
        const { rows } = await pool.query('SELECT employee_id, name FROM employees ORDER BY employee_id ASC');
        const map = {};
        for (const row of rows) {
            map[row.employee_id] = row.name;
        }
        return map;
    } catch (error) {
        try {
            const { rows } = await pool.query('SELECT employee_id, name FROM biometric_employees ORDER BY employee_id ASC');
            const map = {};
            for (const row of rows) {
                map[row.employee_id] = row.name;
            }
            return map;
        } catch (legacyError) {
            console.error('[Biometric Service] Failed to fetch employees map from DB:', legacyError.message);
            return {};
        }
    }
}

async function getAllBiometricEmployees() {
    const { getPool } = require('../db');
    const pool = getPool();
    if (!pool) return [];

    try {
        const { rows } = await pool.query(
            'SELECT employee_id, name, department, created_at, updated_at FROM employees ORDER BY employee_id ASC'
        );
        return rows;
    } catch (error) {
        try {
            const { rows } = await pool.query(
                'SELECT employee_id, name, created_at, updated_at FROM biometric_employees ORDER BY employee_id ASC'
            );
            return rows.map((row) => ({
                ...row,
                department: 'General',
            }));
        } catch (legacyError) {
            console.error('[Biometric Service] Failed to fetch employees from DB:', legacyError.message);
            return [];
        }
    }
}

async function upsertBiometricEmployee(employeeId, name, department = 'General') {
    const { getPool } = require('../db');
    const pool = getPool();
    if (!pool) throw new Error('Database not configured');

    await pool.query(
        `INSERT INTO employees (employee_id, name, department, updated_at) 
         VALUES ($1, $2, $3, now()) 
         ON CONFLICT (employee_id) 
         DO UPDATE SET name = EXCLUDED.name,
                       department = EXCLUDED.department,
                       updated_at = now()`,
        [employeeId, name, department]
    );

    await pool.query(
        `INSERT INTO biometric_employees (employee_id, name, updated_at) 
         VALUES ($1, $2, now()) 
         ON CONFLICT (employee_id) 
         DO UPDATE SET name = EXCLUDED.name, updated_at = now()`,
        [employeeId, name]
    );

    return { employee_id: employeeId, name, department };
}

async function deleteBiometricEmployee(employeeId) {
    const { getPool } = require('../db');
    const pool = getPool();
    if (!pool) throw new Error('Database not configured');

    await pool.query('DELETE FROM employees WHERE employee_id = $1', [employeeId]);
    await pool.query('DELETE FROM biometric_employees WHERE employee_id = $1', [employeeId]).catch(() => {});
    return { success: true };
}

function parseList(value, fallback) {
    if (!value) return fallback;
    const parts = String(value)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    return parts.length ? parts : fallback;
}

function parseEmployeeMap(value) {
    if (!value) return {};

    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_error) {
        return {};
    }
}

function normalizeMachineSerial(value) {
    const text = String(value || '').trim();
    if (!text) return '';

    const stripped = text.replace(/^0+/, '');
    return stripped || text;
}

function normalizeMachineSerials(value, fallback) {
    const serials = parseList(value, fallback);
    const normalized = new Set();

    for (const serial of serials) {
        const text = String(serial || '').trim();
        if (!text) continue;

        normalized.add(text);
        const stripped = text.replace(/^0+/, '');
        if (stripped) normalized.add(stripped);
    }

    return Array.from(normalized);
}

function parseJsonObject(value, fallback = {}) {
    if (!value) return fallback;

    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
    } catch {
        return fallback;
    }
}

function normalizeSqlServerAccessMap(value) {
    const accessMap = parseJsonObject(value, {});
    const normalized = {};

    for (const [key, accessValue] of Object.entries(accessMap)) {
        const cleanedValue = String(accessValue || '').trim().toUpperCase();
        if (!cleanedValue) continue;

        const normalizedKey = normalizeMachineSerial(key);
        if (normalizedKey) normalized[normalizedKey] = cleanedValue;
        if (key && key !== normalizedKey) normalized[String(key).trim()] = cleanedValue;
    }

    return normalized;
}

function getConfig() {
    return {
        source: (process.env.BIOMETRIC_SOURCE || 'sqlserver').trim().toLowerCase(),
        baseUrl: (process.env.BIOMETRIC_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, ''),
        path: (process.env.BIOMETRIC_PATH || '/frmRmsReport.aspx?name=A').trim(),
        reportMethod: (process.env.BIOMETRIC_REPORT_METHOD || 'get').trim().toLowerCase(),
        loginPath: (process.env.BIOMETRIC_LOGIN_PATH || '').trim(),
        username: (process.env.BIOMETRIC_USERNAME || '').trim(),
        password: (process.env.BIOMETRIC_PASSWORD || '').trim(),
        authType: (process.env.BIOMETRIC_AUTH_TYPE || 'basic').trim().toLowerCase(),
        bearerToken: (process.env.BIOMETRIC_BEARER_TOKEN || '').trim(),
        cookie: (process.env.BIOMETRIC_COOKIE || '').trim(),
        formUsernameField: (process.env.BIOMETRIC_FORM_USERNAME_FIELD || 'txtUserName').trim(),
        formPasswordField: (process.env.BIOMETRIC_FORM_PASSWORD_FIELD || 'txtPassword').trim(),
        formSubmitField: (process.env.BIOMETRIC_FORM_SUBMIT_FIELD || 'btnLogin').trim(),
        formSubmitValue: (process.env.BIOMETRIC_FORM_SUBMIT_VALUE || 'Login').trim(),
        loginSuccessMarker: (process.env.BIOMETRIC_LOGIN_SUCCESS_MARKER || 'Logout').trim(),
        timeoutMs: Number.parseInt(process.env.BIOMETRIC_TIMEOUT_MS || '10000', 10),
        allowedEvents: parseList(process.env.BIOMETRIC_ALLOWED_EVENTS, DEFAULT_ALLOWED_EVENTS).map((item) => item.toUpperCase()),
        allowedSerials: normalizeMachineSerials(process.env.BIOMETRIC_MACHINE_SERIALS, DEFAULT_ALLOWED_SERIALS),
        employeeMap: parseEmployeeMap(process.env.BIOMETRIC_EMPLOYEE_MAP),
        dateField: (process.env.BIOMETRIC_DATE_FIELD || '').trim(),
        fromDateField: (process.env.BIOMETRIC_FROM_DATE_FIELD || '').trim(),
        toDateField: (process.env.BIOMETRIC_TO_DATE_FIELD || '').trim(),
        extraParams: parseJsonObject(process.env.BIOMETRIC_EXTRA_PARAMS),
        dateFormat: (process.env.BIOMETRIC_DATE_FORMAT || 'MM/DD/YYYY').trim().toUpperCase(),
        sqlServerHost: (process.env.BIOMETRIC_SQLSERVER_HOST || '').trim(),
        sqlServerPort: Number.parseInt(process.env.BIOMETRIC_SQLSERVER_PORT || '1433', 10),
        sqlServerInstance: (process.env.BIOMETRIC_SQLSERVER_INSTANCE || '').trim(),
        sqlServerDatabase: (process.env.BIOMETRIC_SQLSERVER_DATABASE || 'SAVIOR').trim(),
        sqlServerUser: (process.env.BIOMETRIC_SQLSERVER_USER || '').trim(),
        sqlServerPassword: (process.env.BIOMETRIC_SQLSERVER_PASSWORD || '').trim(),
        sqlServerEncrypt: String(process.env.BIOMETRIC_SQLSERVER_ENCRYPT || 'false').trim().toLowerCase() === 'true',
        sqlServerTrustCert: String(process.env.BIOMETRIC_SQLSERVER_TRUST_CERT || 'true').trim().toLowerCase() === 'true',
        sqlServerUseUtc: String(process.env.BIOMETRIC_SQLSERVER_USE_UTC || 'false').trim().toLowerCase() === 'true',
        sqlServerTable: (process.env.BIOMETRIC_SQLSERVER_TABLE || 'machinerawpunch').trim(),
        sqlServerDateColumn: (process.env.BIOMETRIC_SQLSERVER_DATE_COLUMN || 'officepunch').trim(),
        sqlServerCardColumn: (process.env.BIOMETRIC_SQLSERVER_CARD_COLUMN || 'cardno').trim(),
        sqlServerInOutColumn: (process.env.BIOMETRIC_SQLSERVER_INOUT_COLUMN || 'inout').trim(),
        sqlServerMachineColumn: (process.env.BIOMETRIC_SQLSERVER_MACHINE_COLUMN || 'mc_no').trim(),
        sqlServerNameColumn: (process.env.BIOMETRIC_SQLSERVER_NAME_COLUMN || '').trim(),
        sqlServerLocationColumn: (process.env.BIOMETRIC_SQLSERVER_LOCATION_COLUMN || '').trim(),
        sqlServerAccessMap: normalizeSqlServerAccessMap(process.env.BIOMETRIC_SQLSERVER_ACCESS_MAP || JSON.stringify({
            '00054': 'IN',
            '00055': 'OUT',
        })),
        debug: String(process.env.BIOMETRIC_DEBUG || 'false').trim().toLowerCase() === 'true',
    };
}

function getDashboardTimezone() {
    return (process.env.APP_TIMEZONE || process.env.TZ || 'Asia/Kolkata').trim() || 'Asia/Kolkata';
}



async function getMssql() {
    if (mssql) return mssql;
    mssql = require('mssql');
    return mssql;
}

function parseDateTimeString(value) {
    const text = String(value || '').trim();
    if (!text) return null;

    const nativeParsed = new Date(text);
    if (!Number.isNaN(nativeParsed.getTime())) {
        return nativeParsed;
    }

    const normalized = text.replace('T', ' ').replace(/\.\d+Z?$/, '');
    const match = normalized.match(
        /^(\d{1,4})[/-](\d{1,2})[/-](\d{1,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i
    );

    if (!match) return null;

    let first = Number(match[1]);
    let second = Number(match[2]);
    let third = Number(match[3]);
    let hour = Number(match[4] || 0);
    const minute = Number(match[5] || 0);
    const secondValue = Number(match[6] || 0);
    const meridiem = String(match[7] || '').toUpperCase();

    let year;
    let month;
    let day;

    if (String(match[1]).length === 4) {
        year = first;
        month = second;
        day = third;
    } else if (String(match[3]).length === 4) {
        year = third;
        if (first > 12) {
            day = first;
            month = second;
        } else {
            month = first;
            day = second;
        }
    } else {
        return null;
    }

    if (meridiem === 'PM' && hour < 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;

    const parsed = new Date(year, month - 1, day, hour, minute, secondValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeSqlServerAccess(value) {
    const normalized = String(value || '').trim().toUpperCase();
    if (normalized === '0' || normalized === 'O' || normalized === 'OUT') return 'OUT';
    if (normalized === '1' || normalized === 'I' || normalized === 'IN' || normalized === 'N') return 'IN';
    return '';
}

function pad(value) {
    return String(value).padStart(2, '0');
}

function getDatePartsInTimezone(date, timeZone = getDashboardTimezone()) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });

    const parts = formatter.formatToParts(date).reduce((acc, part) => {
        if (part.type !== 'literal') {
            acc[part.type] = part.value;
        }
        return acc;
    }, {});

    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
    };
}

function getDateTimePartsInTimezone(date, timeZone = getDashboardTimezone()) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });

    const parts = formatter.formatToParts(date).reduce((acc, part) => {
        if (part.type !== 'literal') {
            acc[part.type] = part.value;
        }
        return acc;
    }, {});

    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        hour: Number(parts.hour) % 24,
        minute: Number(parts.minute),
        second: Number(parts.second),
    };
}

function formatTimestamp(date, timeZone = getDashboardTimezone()) {
    const parts = getDateTimePartsInTimezone(date, timeZone);
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

function getTimezoneDateString(date = new Date(), timeZone = getDashboardTimezone()) {
    const parts = getDatePartsInTimezone(date, timeZone);
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function addDaysToDateString(dateText, days = 1) {
    const match = String(dateText || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '';

    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0));
    date.setUTCDate(date.getUTCDate() + days);
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function getUtcInstantForTimezoneDate(dateText, timeZone = getDashboardTimezone()) {
    const match = String(dateText || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;

    const utcMidnight = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
    let guess = new Date(utcMidnight);

    for (let index = 0; index < 3; index += 1) {
        const zonedParts = getDatePartsInTimezone(guess, timeZone);
        const zonedAsUtc = Date.UTC(zonedParts.year, zonedParts.month - 1, zonedParts.day, 0, 0, 0, 0);
        const offsetMs = zonedAsUtc - guess.getTime();
        const nextGuess = new Date(utcMidnight - offsetMs);

        if (nextGuess.getTime() === guess.getTime()) break;
        guess = nextGuess;
    }

    return guess;
}

function getLogWindowForDate(dateText, timeZone = getDashboardTimezone()) {
    const date = typeof dateText === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateText)
        ? dateText
        : getTimezoneDateString(new Date(), timeZone);

    const [year, month, day] = date.split('-').map((value) => Number(value));
    const start = getUtcInstantForTimezoneDate(date, timeZone) || new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    const endDateText = addDaysToDateString(date, 1);
    const end = getUtcInstantForTimezoneDate(endDateText, timeZone)
        || new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0));

    return {
        date,
        start: `${date} 00:00:00 (${timeZone})`,
        end: `${endDateText || date} 00:00:00 (${timeZone})`,
        startMs: start.getTime(),
        endMs: end.getTime(),
    };
}

function normalizeSqlServerRows(rows, config, employeesMap) {
    return rows.map((row) => {
        const employeeName = String(row.employeeName || row.name || '').trim();
        const employeeId = String(row.cardno || row.employeeId || employeeName || '').trim();
        const timestamp = row.officepunch instanceof Date
            ? row.officepunch
            : parseDateTimeString(row.officepunch);
        const serial = normalizeMachineSerial(row.mc_no);
        const locationText = String(row.location || '').trim();
        const mappedAccess = normalizeSqlServerAccess(config.sqlServerAccessMap?.[serial] || '');
        const access = mappedAccess
            || normalizeSqlServerAccess(row.inout)
            || normalizeSqlServerAccess(locationText)
            || 'UNKNOWN';

        const nameFromMap = employeesMap[employeeId] || employeesMap[employeeName] || config.employeeMap[employeeId] || config.employeeMap[employeeName];

        if (config.allowedSerials.length && (!serial || !config.allowedSerials.includes(serial))) {
            return null;
        }

        if (!timestamp) return null;

        return {
            employeeId: employeeId || employeeName || serial || 'Unknown',
            name: employeeName || nameFromMap || 'Unknown',
            access,
            timestamp: formatTimestamp(timestamp),
            timestampMs: timestamp.getTime(),
        };
    }).filter(Boolean);
}

async function fetchServerRoomAccessLogsFromSqlServer(config, date) {
    if (!config.sqlServerHost || !config.sqlServerUser || !config.sqlServerPassword || !config.sqlServerDatabase) {
        throw new Error('SQL Server biometric source is enabled, but BIOMETRIC_SQLSERVER_HOST/USER/PASSWORD/DATABASE are not fully configured.');
    }

    const sql = await getMssql();
    const window = getLogWindowForDate(date);
    const pool = new sql.ConnectionPool({
        server: config.sqlServerHost,
        database: config.sqlServerDatabase,
        user: config.sqlServerUser,
        password: config.sqlServerPassword,
        options: {
            encrypt: config.sqlServerEncrypt,
            trustServerCertificate: config.sqlServerTrustCert,
            useUTC: config.sqlServerUseUtc,
            ...(config.sqlServerInstance ? { instanceName: config.sqlServerInstance } : {}),
        },
        ...(!config.sqlServerInstance && Number.isFinite(config.sqlServerPort) && config.sqlServerPort > 0
            ? { port: config.sqlServerPort }
            : {}),
    });

    await pool.connect();

    try {
        const employeesMap = await getBiometricEmployeesMap();
        const allowedSerials = Array.isArray(config.allowedSerials) ? config.allowedSerials.filter(Boolean) : [];
        const request = pool.request();
        request.input('targetDate', sql.VarChar(10), window.date);

        const whereClauses = [];
        whereClauses.push(`CONVERT(date, [${config.sqlServerDateColumn}]) = CONVERT(date, @targetDate)`);

        if (allowedSerials.length) {
            const serialFilterSql = allowedSerials.map((serial, index) => {
                const paramName = `serial${index}`;
                request.input(paramName, sql.VarChar, serial);
                return `@${paramName}`;
            }).join(', ');
            whereClauses.push(`CONVERT(VARCHAR(50), [${config.sqlServerMachineColumn}]) IN (${serialFilterSql})`);
        }

        const query = `
            SELECT 
                [${config.sqlServerCardColumn}] AS cardno,
                [${config.sqlServerDateColumn}] AS officepunch,
                [${config.sqlServerInOutColumn}] AS inout,
                ${config.sqlServerNameColumn ? `[${config.sqlServerNameColumn}] AS employeeName,` : ''}
                ${config.sqlServerLocationColumn ? `[${config.sqlServerLocationColumn}] AS location,` : ''}
                [${config.sqlServerMachineColumn}] AS mc_no
            FROM [${config.sqlServerTable}]
            WHERE ${whereClauses.join(' AND ')}
            ORDER BY [${config.sqlServerDateColumn}] DESC
        `;

        const result = await request.query(query);
        const rows = Array.isArray(result?.recordset) ? result.recordset : [];

        return normalizeSqlServerRows(rows, config, employeesMap);
    } finally {
        await pool.close();
    }
}

async function fetchServerRoomAccessLogs({ date } = {}) {
    const config = getConfig();
    if (config.source !== 'sqlserver') {
        throw new Error('Biometric fetch is configured for SQL Server only. Set BIOMETRIC_SOURCE=sqlserver.');
    }

    return fetchServerRoomAccessLogsFromSqlServer(config, date);
}

module.exports = {
    fetchServerRoomAccessLogs,
    getLogWindowForDate,
    getAllBiometricEmployees,
    upsertBiometricEmployee,
    deleteBiometricEmployee,
};
