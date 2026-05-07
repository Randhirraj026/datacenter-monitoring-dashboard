'use strict';

/**
 * iloService.js  –  HPE iLO 4 / iLO 5 / iLO 6
 *
 * ROOT CAUSES OF "socket hang up" (all fixed here):
 * ─────────────────────────────────────────────────────────────────
 * 1. iLO firmware drops TCP when a GET request includes Content-Type
 *    or Content-Length headers → fixed: iloGET() sends ONLY Accept + auth.
 *
 * 2. iLO 5/6 has a hard limit of ~3-5 concurrent TCP connections per client.
 *    Firing Promise.all([sys, chassis, thermal, power]) = 4 simultaneous
 *    connections causes iLO to hang up the extras.
 *    → fixed: all requests to a single iLO are SERIALISED (one at a time).
 *
 * 3. No retry on transient socket hang ups.
 *    → fixed: iloGET() retries once on ECONNRESET / socket hang up.
 *
 * 4. After session auth the very first GET on a fresh TCP connection
 *    can race against iLO's connection setup.
 *    → fixed: small delay (100 ms) after session creation before GETs.
 */

const https = require('https');

const ILO_SERVERS = [
    { ip: process.env.ILO_HOST_1 || '10.10.10.71',  user: process.env.ILO_USER_1 || 'Administrator', pass: process.env.ILO_PASS_1 || '' },
    { ip: process.env.ILO_HOST_2 || '10.10.10.75',  user: process.env.ILO_USER_2 || 'Administrator', pass: process.env.ILO_PASS_2 || '' },
    { ip: process.env.ILO_HOST_3 || '10.10.10.76',  user: process.env.ILO_USER_3 || 'Administrator', pass: process.env.ILO_PASS_3 || '' },
];

const TIMEOUT_MS  = 20000;
const CACHE_TTL   = parseInt(process.env.ILO_CACHE_TTL, 10) || 20000;
const SESSION_TTL = 25 * 60 * 1000;
const BP          = '/redfish/v1';

// Small pause after session creation — lets iLO finish its internal setup
const POST_AUTH_DELAY_MS = 150;

let _cache     = null;
let _cacheTime = 0;

// { [ip]: { mode:'session'|'basic', token?, sessionUrl?, expiresAt?, basicAuth? } }
const _auth = {};

// ─────────────────────────────────────────────────────────────────
//  sleep helper
// ─────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────────
//  iloGET — ONLY Accept + auth headers.
//  NO Content-Type, NO Content-Length (iLO drops connection if present on GET).
//  Retries once on socket hang up / ECONNRESET.
// ─────────────────────────────────────────────────────────────────
function _rawGET(ip, path, authHeaders) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: ip,
            port: 443,
            path,
            method: 'GET',
            rejectUnauthorized: false,
            // Explicitly disable keep-alive so each request gets a fresh
            // connection — prevents iLO from closing a reused socket mid-flight
            agent: new https.Agent({ keepAlive: false, rejectUnauthorized: false }),
            headers: { 'Accept': 'application/json', ...authHeaders },
        }, res => {
            let raw = '';
            res.on('data', c => { raw += c; });
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: raw }));
        });
        req.setTimeout(TIMEOUT_MS, () => { req.destroy(); reject(new Error(`GET timeout: ${ip}${path}`)); });
        req.on('error', e => reject(new Error(`${ip}: ${e.message}`)));
        req.end();
    });
}

async function iloGET(ip, path, authHeaders) {
    try {
        return await _rawGET(ip, path, authHeaders);
    } catch (e) {
        // One automatic retry on transient connection resets
        if (/socket hang up|ECONNRESET|ECONNREFUSED/i.test(e.message)) {
            await sleep(300);
            return _rawGET(ip, path, authHeaders);
        }
        throw e;
    }
}

// ─────────────────────────────────────────────────────────────────
//  iloPOST — Content-Type + byte-exact Content-Length + auth.
// ─────────────────────────────────────────────────────────────────
function iloPOST(ip, path, authHeaders, bodyObj) {
    return new Promise((resolve, reject) => {
        const buf = Buffer.from(JSON.stringify(bodyObj || {}), 'utf8');
        const req = https.request({
            hostname: ip,
            port: 443,
            path,
            method: 'POST',
            rejectUnauthorized: false,
            agent: new https.Agent({ keepAlive: false, rejectUnauthorized: false }),
            headers: {
                'Content-Type':   'application/json',
                'Accept':         'application/json',
                'Content-Length': buf.length,
                ...authHeaders,
            },
        }, res => {
            let raw = '';
            res.on('data', c => { raw += c; });
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: raw }));
        });
        req.setTimeout(TIMEOUT_MS, () => { req.destroy(); reject(new Error(`POST timeout: ${ip}${path}`)); });
        req.on('error', e => reject(new Error(`${ip}: ${e.message}`)));
        req.write(buf);
        req.end();
    });
}

// ─────────────────────────────────────────────────────────────────
//  iloDELETE — session cleanup, best-effort, never throws
// ─────────────────────────────────────────────────────────────────
function iloDELETE(ip, path, authHeaders) {
    return new Promise(resolve => {
        const req = https.request({
            hostname: ip, port: 443, path, method: 'DELETE',
            rejectUnauthorized: false,
            agent: new https.Agent({ keepAlive: false, rejectUnauthorized: false }),
            headers: { 'Accept': 'application/json', ...authHeaders },
        }, res => { res.resume(); res.on('end', resolve); });
        req.setTimeout(5000, () => { req.destroy(); resolve(); });
        req.on('error', () => resolve());
        req.end();
    });
}

// ─────────────────────────────────────────────────────────────────
//  getAuthHeaders — auto-detect session vs basic, cache result
// ─────────────────────────────────────────────────────────────────
async function getAuthHeaders(ip, user, pass) {
    const state = _auth[ip];

    if (state?.mode === 'session' && state.token && state.expiresAt > Date.now())
        return { 'X-Auth-Token': state.token };

    if (state?.mode === 'basic')
        return { 'Authorization': state.basicAuth };

    // Clean up expired session
    if (state?.mode === 'session' && state.sessionUrl)
        iloDELETE(ip, state.sessionUrl, { 'X-Auth-Token': state.token });
    delete _auth[ip];

    const basicAuth = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

    // ── Try Session Auth (iLO 5/6) ────────────────────────────────
    try {
        const resp = await iloPOST(
            ip, `${BP}/SessionService/Sessions/`,
            { 'Authorization': basicAuth },
            { UserName: user, Password: pass }
        );

        if ((resp.status === 200 || resp.status === 201) && resp.headers['x-auth-token']) {
            const token = resp.headers['x-auth-token'];
            const loc   = resp.headers['location'] || '';
            _auth[ip]   = { mode: 'session', token, sessionUrl: loc, expiresAt: Date.now() + SESSION_TTL };
            console.log(`[iLO] ${ip} ✓ Session auth (iLO 5/6)`);
            // Wait briefly so iLO finishes its internal session setup
            // before we start firing GETs on a brand-new connection
            await sleep(POST_AUTH_DELAY_MS);
            return { 'X-Auth-Token': token };
        }

        if (resp.status === 400 || resp.status === 401) {
            let b = {};
            try { b = JSON.parse(resp.body); } catch { /* ignore invalid JSON */ }
            const mid = b?.error?.['@Message.ExtendedInfo']?.[0]?.MessageId || '';
            if (mid.includes('UnauthorizedLoginAttempt')) {
                console.error(`[iLO] ${ip} ✗ Wrong password — fix ILO_PASS_${ILO_SERVERS.findIndex(s => s.ip === ip) + 1} in .env`);
                throw new Error(`Wrong password for ${user}@${ip}`);
            }
        }
        console.log(`[iLO] ${ip} → Session returned HTTP ${resp.status}, trying Basic Auth`);
    } catch (e) {
        if (/Wrong password/i.test(e.message)) throw e;
        console.log(`[iLO] ${ip} → Session failed (${e.message.slice(0, 60)}), trying Basic Auth`);
    }

    // ── Try Basic Auth (iLO 4 / fallback) ────────────────────────
    try {
        const resp = await iloGET(ip, `${BP}/Systems/1/`, { 'Authorization': basicAuth });
        if (resp.status === 200) {
            _auth[ip] = { mode: 'basic', basicAuth };
            console.log(`[iLO] ${ip} ✓ Basic auth (iLO 4 mode)`);
            return { 'Authorization': basicAuth };
        }
        if (resp.status === 401) {
            console.error(`[iLO] ${ip} ✗ Wrong password — fix ILO_PASS_${ILO_SERVERS.findIndex(s => s.ip === ip) + 1} in .env`);
            throw new Error(`Wrong password for ${user}@${ip}`);
        }
        _auth[ip] = { mode: 'basic', basicAuth };
        return { 'Authorization': basicAuth };
    } catch (e) {
        throw new Error(`Cannot connect to iLO ${ip}: ${e.message}`, { cause: e });
    }
}

// ─────────────────────────────────────────────────────────────────
//  iloGet — authenticated GET with 401 handling
// ─────────────────────────────────────────────────────────────────
async function iloGet(ip, path, authHeaders) {
    const resp = await iloGET(ip, path, authHeaders);
    if (resp.status === 401) { delete _auth[ip]; throw new Error(`401: ${path}`); }
    if (resp.status === 403) throw new Error(`403 Forbidden: ${path}`);
    if (resp.status === 404) throw new Error(`404 Not Found: ${path}`);
    if (resp.status < 200 || resp.status >= 300) throw new Error(`HTTP ${resp.status}: ${path}`);
    try   { return JSON.parse(resp.body); }
    catch { throw new Error(`JSON parse error: ${path}`); }
}

// ─────────────────────────────────────────────────────────────────
//  fetchOneServer
//
//  KEY FIX: All requests are SEQUENTIAL (await one at a time).
//  iLO 5/6 only handles a few concurrent connections per client.
//  Parallel Promise.all() was causing iLO to hang up the extras.
// ─────────────────────────────────────────────────────────────────
async function fetchOneServer({ ip, user, pass }) {
    const stub = { ip, reachable: false, error: null };
    try {
        const auth = await getAuthHeaders(ip, user, pass);

        // ── Sequential GETs — avoids overwhelming iLO's connection limit ──
        const sys     = await iloGet(ip, `${BP}/Systems/1/`,         auth);
        const chassis = await iloGet(ip, `${BP}/Chassis/1/`,         auth);
        const thermal = await iloGet(ip, `${BP}/Chassis/1/Thermal/`, auth).catch(() => null);
        const power   = await iloGet(ip, `${BP}/Chassis/1/Power/`,   auth).catch(() => null);
        if (power) console.log(`[iLO] ${ip} Power keys:`, JSON.stringify(Object.keys(power?.PowerControl?.[0] || {})));
        const memData = await iloGet(ip, `${BP}/Systems/1/Memory/`,     auth).catch(() => null);
        const procData= await iloGet(ip, `${BP}/Systems/1/Processors/`, auth).catch(() => null);

        let storageData = await iloGet(ip, `${BP}/Systems/1/Storage/`, auth).catch(() => null);
        if (!storageData?.Members?.length)
            storageData = await iloGet(ip, `${BP}/Systems/1/SmartStorage/ArrayControllers/`, auth).catch(() => null);

        // Temperature
        const rawTemps = thermal?.Temperatures || [];
        const allTemps = rawTemps.filter(t => t.ReadingCelsius != null).map(t => ({
            name: t.Name || 'Sensor', readingC: t.ReadingCelsius,
            upperWarnC: t.UpperThresholdNonCritical ?? null,
            upperCritC: t.UpperThresholdCritical    ?? null,
            status: t.Status?.Health || 'OK',
        }));
        const inletSensor = rawTemps.find(t => /inlet|ambient|01-inlet|01-system/i.test(t.Name || ''));
        const inletC      = inletSensor?.ReadingCelsius ?? null;
        const cpuTemps    = rawTemps.filter(t => /cpu|proc/i.test(t.Name || ''));
        const cpuAvg      = cpuTemps.length
            ? Math.round(cpuTemps.reduce((s, t) => s + (t.ReadingCelsius || 0), 0) / cpuTemps.length) : null;

        // Fans
        const fans = (thermal?.Fans || []).map(f => ({
            name: f.Name || f.FanName || 'Fan',
            rpm:  f.Reading ?? f.CurrentReading ?? null,
            pct:  f.ReadingUnits === 'Percent' ? f.Reading : null,
            status: f.Status?.Health || f.Status?.State || 'Unknown',
        }));

        // Power
        const psus = (power?.PowerSupplies || []).map(p => ({
            name: p.Name || 'PSU',
            inputWatts: p.PowerInputWatts ?? p.LastPowerOutputWatts ?? null,
            status: p.Status?.Health || 'Unknown',
            state:  p.Status?.State  || 'Unknown',
        }));
        // Try every known Redfish property path for total consumed watts
        const consumedWatts =
            power?.PowerControl?.[0]?.PowerConsumedWatts        ??
            power?.PowerControl?.[0]?.PowerMetrics?.AverageConsumedWatts ??
            power?.PowerControl?.[0]?.LastPowerOutputWatts      ??
            power?.Oem?.Hp?.PowerAllocationLimit               ??
            (psus.length ? psus.reduce((s, p) => s + (p.inputWatts || 0), 0) || null : null);

        // Memory
        let totalMemGB = sys.MemorySummary?.TotalSystemMemoryGiB ?? sys.MemorySummary?.TotalSystemMemoryGB ?? null;
        if (!totalMemGB && memData?.Members)
            totalMemGB = memData.Members.reduce((s, m) => s + (m.CapacityMiB || 0), 0) / 1024;

        // Processor
        let processor = { model: null, count: 0, status: 'Unknown' };
        if (sys.ProcessorSummary) {
            processor = {
                model:  sys.ProcessorSummary.Model  || null,
                count:  sys.ProcessorSummary.Count  || 0,
                status: sys.ProcessorSummary.Status?.Health || 'Unknown',
            };
        } else if (procData?.Members?.length) {
            const link  = procData.Members[0]['@odata.id'] || procData.Members[0].href;
            const first = link ? await iloGet(ip, link, auth).catch(() => null) : null;
            processor   = { model: first?.Model || null, count: procData.Members.length, status: first?.Status?.Health || 'Unknown' };
        }

        // Storage — sequential to avoid connection saturation
        const storage        = [];
        const storageMembers = storageData?.Members || storageData?.StorageControllers || [];
        for (const m of storageMembers.slice(0, 4)) {
            const link = m['@odata.id'] || m.href;
            if (!link) continue;
            const ctrl = await iloGet(ip, link, auth).catch(() => null);
            if (ctrl) storage.push({
                name:   ctrl.Name   || ctrl.Model || 'Controller',
                status: ctrl.Status?.Health || 'Unknown',
                drives: ctrl.Drives?.length ?? ctrl.DrivesCount ?? 0,
            });
        }

        // Power capacity (watts) — used by frontend to calculate utilization %
        const powerCapW = power?.PowerControl?.[0]?.PowerCapacityWatts
                       || power?.PowerControl?.[0]?.PowerLimit?.LimitInWatts
                       || null;

        return {
            ...stub, reachable: true,
            serverName: sys.HostName    || sys.Name          || `Server-${ip}`,
            model:      sys.Model       || chassis.Model     || 'Unknown',
            serial:     sys.SKU         || sys.SerialNumber  || chassis.SerialNumber || '–',
            bios:       sys.BiosVersion || sys.Bios?.Current?.VersionString || '–',
            health:     sys.Status?.Health || chassis.Status?.Health || 'Unknown',
            temperature: { inlet: inletC, cpuAvg, all: allTemps },
            power: { consumedWatts, capacityWatts: powerCapW },
            _rawPowerCapW: powerCapW,
            fans, psus,
            memory: { totalGB: totalMemGB ? Math.round(totalMemGB) : null },
            processor, storage,
        };

    } catch (err) {
        if (/401|Wrong password/i.test(err.message)) delete _auth[ip];
        console.error(`[iLO] ${ip} —`, err.message);
        return { ...stub, error: err.message };
    }
}

// ─────────────────────────────────────────────────────────────────
//  fetchAllILO — public API
//  Servers are also fetched sequentially to avoid overwhelming the
//  network switch / iLO management ports simultaneously.
// ─────────────────────────────────────────────────────────────────
async function fetchAllILO() {
    if (_cache && (Date.now() - _cacheTime) < CACHE_TTL) return _cache;

    // Sequential fetch across servers — iLO management ports are low-bandwidth
    const servers = [];
    for (const srv of ILO_SERVERS) {
        servers.push(await fetchOneServer(srv));
    }

    const reachable     = servers.filter(s => s.reachable);
    const totalPowerKW  = parseFloat((reachable.reduce((s, srv) => s + (srv.power?.consumedWatts || 0), 0) / 1000).toFixed(2));
    const inletTemps    = reachable.map(s => s.temperature?.inlet).filter(v => v != null);
    const avgInletTempC = inletTemps.length ? Math.round(inletTemps.reduce((a, b) => a + b, 0) / inletTemps.length) : null;

    const result = {
        servers,
        summary: {
            reachable:     reachable.length,
            total:         servers.length,
            totalPowerKW,
            avgInletTempC,
            timestamp:     new Date().toISOString(),
        },
    };
    _cache = result; _cacheTime = Date.now();
    return result;
}

module.exports = { fetchAllILO, ILO_SERVERS };