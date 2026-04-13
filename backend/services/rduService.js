'use strict';

const axios = require('axios');
const https = require('https');
const querystring = require('querystring');

const DEFAULT_TIMEOUT_MS = parseInt(process.env.RDU_TIMEOUT_MS || '15000', 10);
const CACHE_TTL = parseInt(process.env.RDU_CACHE_TTL || '10000', 10);
const SESSION_TTL = 10 * 60 * 1000;

const VERTIV_CGI_SIGNAL_REQUEST = '3;-99,501,4,5,68,9,72;5,4031,4,17,72,25,79;7,907,2,3,4;';
const VERTIV_ENV_SENSOR_EQUIP_ID = 2;
const VERTIV_OVERVIEW_ELEMENT_LIST = '4|36;700;0,5@37;701;0,68@38;700;0,9@39;701;0,72@';

const VERTIV_SIGNAL_META = {
    '-99|501|5': { name: 'Rack Front Temp', unit: 'C', kind: 'number' },
    '-99|501|68': { name: 'Rack Front Humidity', unit: '%', kind: 'number' },
    '-99|501|9': { name: 'Rack Rear Temp', unit: 'C', kind: 'number' },
    '-99|501|72': { name: 'Rack Rear Humidity', unit: '%', kind: 'number' },
    '5|4031|17': { name: 'UPS Battery Runtime', unit: 'min', kind: 'number' },
    '5|4031|72': { name: 'UPS Battery Capacity', unit: '%', kind: 'number' },
    '5|4031|25': {
        name: 'UPS Power Supply',
        unit: '',
        kind: 'enum',
        options: ['UPS Shutdown', 'Utility OnLine', 'On Battery', 'On Bypass', 'UPS On Union Mode'],
    },
    '5|4031|79': {
        name: 'UPS Input Status',
        unit: '',
        kind: 'enum',
        options: ['Utility OnLine', 'On Battery', 'UPS On Union Mode', 'UPS Shutdown'],
    },
    '7|907|3': { name: 'Return Air Temp', unit: 'C', kind: 'number' },
    '7|907|4': { name: 'Supply Air Temp', unit: 'C', kind: 'number' },
    '4|502|280': { name: 'Smoke Sensor 1', unit: '', kind: 'enum', options: ['Normal', 'Alarm'] },
    '4|502|281': { name: 'Smoke Sensor 2', unit: '', kind: 'enum', options: ['Normal', 'Alarm'] },
    '4|502|282': { name: 'Front Door', unit: '', kind: 'enum', options: ['Normal', 'Alarm'] },
    '4|502|283': { name: 'Rear Door', unit: '', kind: 'enum', options: ['Normal', 'Alarm'] },
    '4|502|544': { name: 'Hooter', unit: '', kind: 'enum', options: ['Open', 'Close'] },
    '4|502|545': { name: 'Status LED', unit: '', kind: 'enum', options: ['Open', 'Close'] },
};

let cache = null;
let cacheTime = 0;
let sessionCookie = '';
let sessionAt = 0;

function isTruthy(value) {
    return String(value || '').toLowerCase() === 'true';
}

function buildConfig() {
    return {
        enabled: isTruthy(process.env.RDU_ENABLED),
        baseUrl: (process.env.RDU_BASE_URL || '').trim().replace(/\/+$/, ''),
        loginPath: (process.env.RDU_LOGIN_PATH || '/cgi-bin/login.cgi').trim(),
        dataPath: (process.env.RDU_DATA_PATH || '/cgi-bin/p50_main_page.cgi').trim(),
        authMode: (process.env.RDU_AUTH_MODE || 'vertiv_cgi').trim().toLowerCase(),
        username: process.env.RDU_USERNAME || '',
        password: process.env.RDU_PASSWORD || '',
        bearerToken: process.env.RDU_BEARER_TOKEN || '',
        verifyTls: isTruthy(process.env.RDU_VERIFY_TLS),
        timeoutMs: DEFAULT_TIMEOUT_MS,
    };
}

function createHttp(config) {
    return axios.create({
        baseURL: config.baseUrl,
        timeout: config.timeoutMs,
        httpsAgent: new https.Agent({ rejectUnauthorized: config.verifyTls }),
        validateStatus: () => true,
        maxRedirects: 0,
    });
}

function toNumber(value) {
    if (value == null || value === '') return null;
    const match = String(value).match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
}

function roundMetric(value, digits = 1) {
    if (value == null || !Number.isFinite(Number(value))) return null;
    return Number(Number(value).toFixed(digits));
}

function formatSensorDisplay(sensor) {
    if (!sensor) return '–';

    if (typeof sensor.value === 'number' && Number.isFinite(sensor.value)) {
        const rounded = roundMetric(sensor.value);
        if (sensor.unit === '%' || sensor.unit === '℃' || sensor.unit === 'C' || sensor.unit === 'min') {
            const unit = sensor.unit === 'C' ? '°C' : sensor.unit;
            return `${rounded}${unit === 'min' ? ` ${unit}` : unit}`;
        }
        return `${rounded}${sensor.unit || ''}`.trim();
    }

    return sensor.displayValue ?? sensor.rawValue ?? '–';
}

function decodeVertivValue(meta, rawValue) {
    if (!meta) {
        return { displayValue: rawValue, normalizedValue: rawValue };
    }

    if (meta.kind === 'number') {
        const normalized = toNumber(rawValue);
        return {
            displayValue: rawValue,
            normalizedValue: normalized,
        };
    }

    if (meta.kind === 'enum') {
        const index = Number(String(rawValue).trim());
        const label = Number.isInteger(index) && meta.options?.[index] != null
            ? meta.options[index]
            : String(rawValue);
        return {
            displayValue: label,
            normalizedValue: label,
        };
    }

    return { displayValue: rawValue, normalizedValue: rawValue };
}

async function loginVertivCgi(http, config) {
    if (sessionCookie && (Date.now() - sessionAt) < SESSION_TTL) {
        return sessionCookie;
    }

    const body = querystring.stringify({
        user_name: Buffer.from(config.username).toString('base64'),
        user_password: Buffer.from(config.password).toString('base64'),
        lan: 'en',
        op_Type: '1',
        rand_code: '0',
        tokenID: '',
        validateValue: '0',
    });

    const response = await http.post(config.loginPath, body, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
    });

    const cookies = response.headers['set-cookie'];
    const text = typeof response.data === 'string' ? response.data : '';

    if (!Array.isArray(cookies) || cookies.length === 0 || !/main_page_polling\.cgi/i.test(text)) {
        throw new Error('Vertiv CGI login failed. Check RDU username/password.');
    }

    sessionCookie = cookies.map((part) => String(part).split(';')[0]).join('; ');
    sessionAt = Date.now();
    return sessionCookie;
}

function parseVertivPolling(text) {
    const sensors = [];

    String(text || '')
        .split(';')
        .map((segment) => segment.trim())
        .filter(Boolean)
        .forEach((segment) => {
            const parts = segment.split('|');
            if (parts.length < 3) return;

            const equipId = parts[0];
            const equipTypeId = parts[1];

            parts.slice(2).forEach((signalPart) => {
                const [signalIdText, payload] = signalPart.split(':');
                if (!signalIdText || !payload) return;

                const payloadParts = payload.split(',');
                const rawValue = (payloadParts[0] || '').trim();
                const alarmLevel = Number(payloadParts[1] || 0);
                const isValid = Number(payloadParts[2] || 0);
                const isConfigured = Number(payloadParts[3] || 0);
                const valueType = (payloadParts[4] || '').trim();
                const key = `${equipId}|${equipTypeId}|${signalIdText.trim()}`;
                const meta = VERTIV_SIGNAL_META[key];
                const decoded = decodeVertivValue(meta, rawValue);

                sensors.push({
                    key,
                    equipId: Number(equipId),
                    equipTypeId: Number(equipTypeId),
                    signalId: Number(signalIdText),
                    name: meta?.name || `Signal ${signalIdText.trim()}`,
                    unit: meta?.unit || '',
                    rawValue,
                    value: decoded.normalizedValue,
                    displayValue: decoded.displayValue,
                    alarmLevel,
                    isValid,
                    isConfigured,
                    valueType,
                });
            });
        });

    return sensors;
}

function getSensor(sensors, key) {
    return sensors.find((sensor) => sensor.key === key);
}

function parseVertivOverviewRefresh(text) {
    const sensors = [];
    const body = String(text || '').trim();
    const [, ...parts] = body.split('|');

    parts.forEach((part) => {
        const [elementId, elementTypeId, payload] = part.split('~');
        if (!elementId || !elementTypeId || !payload) return;

        const [label, rawValue] = payload.split(';');
        if (!label || rawValue == null) return;

        const normalizedLabel = String(label).trim();
        const value = toNumber(rawValue);

        sensors.push({
            key: `overview-${elementId}`,
            elementId: Number(elementId),
            elementTypeId: Number(elementTypeId),
            name: normalizedLabel,
            rawValue: String(rawValue).trim(),
            value,
            displayValue: String(rawValue).trim(),
        });
    });

    return sensors;
}

function parseVertivSampleTable(text, equipId, equipTypeId) {
    const body = String(text || '');
    const [, signalBlob = ''] = body.split('^');
    return signalBlob
        .split(';')
        .map((segment) => segment.trim())
        .filter(Boolean)
        .map((segment) => {
            const parts = segment.split(',');
            if (parts.length < 10) return null;

            const signalId = Number(parts[0]);
            const signalName = parts[1];
            const rawValue = parts[2];
            const unit = parts[3];
            const timestamp = parts[4];
            const alarmLevel = Number(parts[5] || 0);
            const isValid = Number(parts[6] || 0);
            const isConfigured = Number(parts[7] || 0);
            const valueFormat = parts[8];
            const dataType = parts[9];
            const key = `${equipId}|${equipTypeId}|${signalId}`;

            return {
                key,
                equipId,
                equipTypeId,
                signalId,
                name: signalName,
                unit,
                rawValue,
                value: toNumber(rawValue),
                displayValue: `${rawValue}${unit || ''}`.trim(),
                alarmLevel,
                isValid,
                isConfigured,
                valueFormat,
                dataType,
                timestamp,
                source: 'vertiv-sampler',
            };
        })
        .filter(Boolean);
}

function buildVertivAlerts(sensors, alarmCount) {
    const alerts = [];

    sensors.forEach((sensor) => {
        if (sensor.alarmLevel > 0) {
            alerts.push({
                id: `${sensor.key}-alarm`,
                title: `${sensor.name} alert`,
                severity: sensor.alarmLevel >= 2 ? 'critical' : 'warning',
                status: 'active',
                timestamp: null,
                source: 'rdu',
            });
        }
    });

    const powerSupply = getSensor(sensors, '5|4031|25');
    const inputStatus = getSensor(sensors, '5|4031|79');
    const doorFront = getSensor(sensors, '4|502|282');
    const doorRear = getSensor(sensors, '4|502|283');

    if (powerSupply && !/utility online/i.test(String(powerSupply.value))) {
        alerts.push({
            id: 'ups-power-supply',
            title: `UPS power state: ${powerSupply.displayValue}`,
            severity: /shutdown/i.test(String(powerSupply.value)) ? 'critical' : 'warning',
            status: 'active',
            timestamp: null,
            source: 'rdu',
        });
    }

    if (inputStatus && !/utility online/i.test(String(inputStatus.value))) {
        alerts.push({
            id: 'ups-input-status',
            title: `UPS input status: ${inputStatus.displayValue}`,
            severity: /shutdown/i.test(String(inputStatus.value)) ? 'critical' : 'warning',
            status: 'active',
            timestamp: null,
            source: 'rdu',
        });
    }

    if (doorFront && /alarm/i.test(String(doorFront.value))) {
        alerts.push({
            id: 'front-door-alert',
            title: 'Front door alert',
            severity: 'warning',
            status: 'active',
            timestamp: null,
            source: 'rdu',
        });
    }

    if (doorRear && /alarm/i.test(String(doorRear.value))) {
        alerts.push({
            id: 'rear-door-alert',
            title: 'Rear door alert',
            severity: 'warning',
            status: 'active',
            timestamp: null,
            source: 'rdu',
        });
    }

    if (alarmCount > alerts.length) {
        alerts.push({
            id: 'rdu-active-alarm-count',
            title: `${alarmCount} active RDU alarms reported`,
            severity: alarmCount > 1 ? 'warning' : 'info',
            status: 'active',
            timestamp: null,
            source: 'rdu',
        });
    }

    return alerts;
}

async function fetchVertivCgiSummary(config, options = {}) {
    if (!config.baseUrl) {
        return {
            ok: false,
            disabled: false,
            fetchedAt: new Date().toISOString(),
            reason: 'RDU_BASE_URL is missing in backend/.env.',
        };
    }

    if (!config.username || !config.password) {
        return {
            ok: false,
            disabled: false,
            fetchedAt: new Date().toISOString(),
            reason: 'RDU_USERNAME or RDU_PASSWORD is missing in backend/.env.',
        };
    }

    if (!options.forceRefresh && cache && (Date.now() - cacheTime) < CACHE_TTL) {
        return cache;
    }

    const http = createHttp(config);
    const cookie = await loginVertivCgi(http, config);

    const pollResponse = await http.get(config.dataPath, {
        headers: { Cookie: cookie },
        params: {
            sand: Math.random(),
            _op_type: 2,
            _para_Str: VERTIV_CGI_SIGNAL_REQUEST,
        },
    });

    const pollText = typeof pollResponse.data === 'string' ? pollResponse.data : '';
    if (!pollText || /login\.cgi|<!DOCTYPE html/i.test(pollText)) {
        sessionCookie = '';
        sessionAt = 0;
        throw new Error('Vertiv polling session expired. Please retry.');
    }

    const alarmResponse = await http.get('/cgi-bin/main_page_polling.cgi', {
        headers: { Cookie: cookie },
        params: { _op_type: 6 },
    });
    const alarmText = typeof alarmResponse.data === 'string' ? alarmResponse.data.trim() : '';
    const alarmPieces = alarmText.split(',');
    const alarmCount = Number(alarmPieces[1] || 0);

    const overviewResponse = await http.get('/cgi-bin/p101_refresh_page.cgi', {
        headers: { Cookie: cookie },
        params: {
            _equip: -99,
            _op_type: 0,
            _element_list: VERTIV_OVERVIEW_ELEMENT_LIST,
            sand: Math.random(),
        },
    });
    const overviewText = typeof overviewResponse.data === 'string' ? overviewResponse.data : '';
    const overviewSensors = parseVertivOverviewRefresh(overviewText);

    const envSamplerResponse = await http.get('/cgi-bin/p05_equip_sample.cgi', {
        headers: { Cookie: cookie },
        params: {
            sand: Math.random(),
            _equipId: VERTIV_ENV_SENSOR_EQUIP_ID,
            _op_type: 1,
        },
    });
    const envSamplerText = typeof envSamplerResponse.data === 'string' ? envSamplerResponse.data : '';
    const envSamplerSensors = parseVertivSampleTable(envSamplerText, 2, 531);

    const parsedSensors = parseVertivPolling(pollText);
    const rackFrontTemp = overviewSensors.find((sensor) => sensor.name === 'Temp 11')
        || envSamplerSensors.find((sensor) => sensor.signalId === 5)
        || getSensor(parsedSensors, '-99|501|5');
    const rackFrontHumidity = overviewSensors.find((sensor) => sensor.name === 'Hum 11')
        || envSamplerSensors.find((sensor) => sensor.signalId === 68)
        || getSensor(parsedSensors, '-99|501|68');
    const rackRearTemp = overviewSensors.find((sensor) => sensor.name === 'Temp 21')
        || envSamplerSensors.find((sensor) => sensor.signalId === 9)
        || getSensor(parsedSensors, '-99|501|9');
    const rackRearHumidity = overviewSensors.find((sensor) => sensor.name === 'Hum 21')
        || envSamplerSensors.find((sensor) => sensor.signalId === 72)
        || getSensor(parsedSensors, '-99|501|72');
    const batteryRuntime = getSensor(parsedSensors, '5|4031|17');
    const batteryPct = getSensor(parsedSensors, '5|4031|72');
    const powerSupply = getSensor(parsedSensors, '5|4031|25');
    const inputStatus = getSensor(parsedSensors, '5|4031|79');
    const acReturnAir = getSensor(parsedSensors, '7|907|3');
    const acSupplyAir = getSensor(parsedSensors, '7|907|4');

    const humidityValues = [rackFrontHumidity?.value, rackRearHumidity?.value].filter((value) => value != null);
    const humidityPct = humidityValues.length
        ? roundMetric(humidityValues.reduce((sum, value) => sum + Number(value), 0) / humidityValues.length)
        : null;

    const powerCutActive = powerSupply
        ? /on battery|shutdown|bypass/i.test(String(powerSupply.value))
        : inputStatus
            ? /on battery|shutdown/i.test(String(inputStatus.value))
            : null;

    const alerts = buildVertivAlerts(parsedSensors, alarmCount);
    const mergedSensors = [
        ...envSamplerSensors.filter((sensor) => [5, 68, 9, 72].includes(sensor.signalId)).map((sensor) => ({
            ...sensor,
            name: sensor.signalId === 5
                ? 'Rack Front Temp'
                : sensor.signalId === 68
                    ? 'Rack Front Humidity'
                    : sensor.signalId === 9
                        ? 'Rack Rear Temp'
                        : 'Rack Rear Humidity',
        })),
        ...parsedSensors.filter((sensor) => !['-99|501|5', '-99|501|68', '-99|501|9', '-99|501|72'].includes(sensor.key)),
    ];

    const normalizedSensors = mergedSensors.map((sensor, index) => ({
        id: `vertiv-sensor-${index + 1}`,
        name: sensor.name,
        value: formatSensorDisplay(sensor),
        unit: sensor.unit,
        status: sensor.alarmLevel > 0 ? 'Alarm' : sensor.isValid > 0 ? 'OK' : 'Invalid',
        source: 'vertiv-cgi',
    }));

    const result = {
        ok: true,
        fetchedAt: new Date().toISOString(),
        source: config.baseUrl,
        metrics: {
            rackFrontTempC: roundMetric(rackFrontTemp?.value),
            rackRearTempC: roundMetric(rackRearTemp?.value),
            rackFrontHumidityPct: roundMetric(rackFrontHumidity?.value),
            rackRearHumidityPct: roundMetric(rackRearHumidity?.value),
            humidityPct,
            acSupplyAirC: roundMetric(acSupplyAir?.value),
            acReturnAirC: roundMetric(acReturnAir?.value),
            powerCutActive,
            upsBatteryPct: roundMetric(batteryPct?.value),
            upsBatteryMinutesLeft: roundMetric(batteryRuntime?.value),
            mainsStatus: inputStatus?.displayValue ?? null,
            rduStatus: powerSupply?.displayValue ?? 'Connected',
        },
        alerts,
        sensors: normalizedSensors,
        raw: {
            overview: overviewText,
            polling: pollText,
            envSampler: envSamplerText,
            activeAlarmCount: alarmCount,
        },
    };

    cache = result;
    cacheTime = Date.now();
    return result;
}

async function fetchRawRduData(forceRefresh = false) {
    const config = buildConfig();

    if (!config.enabled) {
        return {
            ok: false,
            disabled: true,
            fetchedAt: new Date().toISOString(),
            reason: 'RDU integration is disabled. Set RDU_ENABLED=true in backend/.env.',
        };
    }

    if (config.authMode === 'vertiv_cgi') {
        return fetchVertivCgiSummary(config, { includeRaw: true, forceRefresh });
    }

    return {
        ok: false,
        disabled: false,
        fetchedAt: new Date().toISOString(),
        reason: `Unsupported RDU_AUTH_MODE "${config.authMode}". Use "vertiv_cgi" for this device.`,
    };
}

async function fetchRduSummary(options = {}) {
    try {
        const raw = await fetchRawRduData(options.forceRefresh);
        if (!options.includeRaw && raw && typeof raw === 'object' && 'raw' in raw) {
            return { ...raw, raw: undefined };
        }
        return raw;
    } catch (error) {
        return {
            ok: false,
            fetchedAt: new Date().toISOString(),
            reason: error.message,
            metrics: {
                rackFrontTempC: null,
                rackRearTempC: null,
                rackFrontHumidityPct: null,
                rackRearHumidityPct: null,
                humidityPct: null,
                acSupplyAirC: null,
                acReturnAirC: null,
                powerCutActive: null,
                upsBatteryPct: null,
                upsBatteryMinutesLeft: null,
                mainsStatus: null,
                rduStatus: null,
            },
            alerts: [],
            sensors: [],
        };
    }
}

module.exports = {
    fetchRawRduData,
    fetchRduSummary,
};
