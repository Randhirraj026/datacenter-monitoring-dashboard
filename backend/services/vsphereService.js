'use strict';

/**
 * vsphereService.js — DEFINITIVE FIX
 *
 * ROOT CAUSES FOUND AND FIXED:
 * 1. SOAP prop name tag is <name>...</name> NOT <n>...</n>
 *    (was returning empty props for all hosts → 0 CPU/memory everywhere)
 *
 * 2. /rest/vcenter/vm does NOT return a host field for each VM
 *    (was returning hostId="" for all VMs → 0/0 on every server row)
 *    FIX: Use SOAP to fetch VM→host mapping in bulk
 */

const https = require('https');
const { getRecentAlertSnapshots, isDbConfigured } = require('../db');

const VC_HOST    = process.env.VCENTER_HOST     || '10.10.10.151';
const VC_USER    = process.env.VCENTER_USER     || 'administrator@vsphere.local';
const VC_PASS    = process.env.VCENTER_PASSWORD || '';
const TIMEOUT_MS = 20000;
const CACHE_TTL  = parseInt(process.env.VSPHERE_CACHE_TTL, 10) || 15000;
const SESS_TTL   = 20 * 60 * 1000;

const _cache = {};
const fromCache = k => { const c=_cache[k]; return (c&&Date.now()-c.ts<CACHE_TTL)?c.data:null; };
const toCache   = (k,d) => { _cache[k]={data:d,ts:Date.now()}; return d; };

let _restToken=null, _restTime=0, _soapCookie=null, _soapTime=0;

// ── HTTP ──────────────────────────────────────────────────────────
function http(method, path, headers, body) {
    return new Promise((res, rej) => {
        const buf = body ? Buffer.from(body, 'utf8') : null;
        const req = https.request({
            hostname: VC_HOST, port: 443, path, method,
            rejectUnauthorized: false,
            headers: { 'Content-Length': buf ? buf.length : 0, ...headers },
        }, r => {
            let raw = '';
            r.on('data', c => raw += c);
            r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: raw }));
        });
        req.setTimeout(TIMEOUT_MS, () => { req.destroy(); rej(new Error('Timeout: ' + path)); });
        req.on('error', rej);
        if (buf) req.write(buf);
        req.end();
    });
}

// ── REST session ──────────────────────────────────────────────────
async function restSession() {
    if (_restToken && Date.now() - _restTime < SESS_TTL) return _restToken;
    const basic = `Basic ${Buffer.from(`${VC_USER}:${VC_PASS}`).toString('base64')}`;
    const r = await http('POST', '/rest/com/vmware/cis/session', {
        'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': basic,
    });
    if (r.status === 200 || r.status === 201) {
        _restToken = JSON.parse(r.body).value;
        _restTime  = Date.now();
        console.log('[vSphere] REST session OK');
        return _restToken;
    }
    throw new Error(`REST auth HTTP ${r.status}`);
}

async function vcGet(path) {
    const t = await restSession();
    const r = await http('GET', path, { 'Accept': 'application/json', 'vmware-api-session-id': t });
    if (r.status === 401) { _restToken = null; throw new Error('vCenter 401: ' + path); }
    if (r.status < 200 || r.status >= 300) throw new Error(`vCenter ${r.status}: ${path}`);
    return JSON.parse(r.body);
}

// ── SOAP session ──────────────────────────────────────────────────
async function soapSession() {
    if (_soapCookie && Date.now() - _soapTime < SESS_TTL) return _soapCookie;
    const xml = `<?xml version="1.0"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:vim="urn:vim25"><soapenv:Body><vim:Login><vim:_this type="SessionManager">SessionManager</vim:_this><vim:userName>${VC_USER}</vim:userName><vim:password>${VC_PASS}</vim:password></vim:Login></soapenv:Body></soapenv:Envelope>`;
    const r = await http('POST', '/sdk', { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': 'urn:vim25/6.0' }, xml);
    for (const c of (r.headers['set-cookie'] || [])) {
        if (c.toLowerCase().includes('vmware_soap_session')) {
            _soapCookie = c.split(';')[0].trim();
            _soapTime   = Date.now();
            console.log('[vSphere] SOAP session OK');
            return _soapCookie;
        }
    }
    throw new Error(`SOAP login failed HTTP ${r.status}`);
}

// ── SOAP bulk fetch — moType is 'HostSystem' or 'VirtualMachine' ──
async function soapBulkFetch(moType, pathSets) {
    const cookie  = await soapSession();
    const pathXml = pathSets.map(p => `<vim:pathSet>${p}</vim:pathSet>`).join('\n          ');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:vim="urn:vim25" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soapenv:Body>
    <vim:RetrievePropertiesEx>
      <vim:_this type="PropertyCollector">propertyCollector</vim:_this>
      <vim:specSet>
        <vim:propSet>
          <vim:type>${moType}</vim:type>
          ${pathXml}
        </vim:propSet>
        <vim:objectSet>
          <vim:obj type="Folder">group-d1</vim:obj>
          <vim:skip>true</vim:skip>
          <vim:selectSet xsi:type="vim:TraversalSpec">
            <vim:name>ts_f</vim:name><vim:type>Folder</vim:type>
            <vim:path>childEntity</vim:path><vim:skip>false</vim:skip>
            <vim:selectSet><vim:name>ts_f</vim:name></vim:selectSet>
            <vim:selectSet><vim:name>ts_dc</vim:name></vim:selectSet>
            <vim:selectSet><vim:name>ts_cr</vim:name></vim:selectSet>
            <vim:selectSet><vim:name>ts_ccr</vim:name></vim:selectSet>
            <vim:selectSet><vim:name>ts_rp</vim:name></vim:selectSet>
          </vim:selectSet>
          <vim:selectSet xsi:type="vim:TraversalSpec">
            <vim:name>ts_dc</vim:name><vim:type>Datacenter</vim:type>
            <vim:path>hostFolder</vim:path><vim:skip>false</vim:skip>
            <vim:selectSet><vim:name>ts_f</vim:name></vim:selectSet>
          </vim:selectSet>
          <vim:selectSet xsi:type="vim:TraversalSpec">
            <vim:name>ts_dc_vm</vim:name><vim:type>Datacenter</vim:type>
            <vim:path>vmFolder</vim:path><vim:skip>false</vim:skip>
            <vim:selectSet><vim:name>ts_f</vim:name></vim:selectSet>
          </vim:selectSet>
          <vim:selectSet xsi:type="vim:TraversalSpec">
            <vim:name>ts_cr</vim:name><vim:type>ComputeResource</vim:type>
            <vim:path>host</vim:path><vim:skip>false</vim:skip>
          </vim:selectSet>
          <vim:selectSet xsi:type="vim:TraversalSpec">
            <vim:name>ts_ccr</vim:name><vim:type>ClusterComputeResource</vim:type>
            <vim:path>host</vim:path><vim:skip>false</vim:skip>
          </vim:selectSet>
          <vim:selectSet xsi:type="vim:TraversalSpec">
            <vim:name>ts_rp</vim:name><vim:type>ResourcePool</vim:type>
            <vim:path>vm</vim:path><vim:skip>false</vim:skip>
          </vim:selectSet>
        </vim:objectSet>
      </vim:specSet>
      <vim:options><vim:maxObjects>1000</vim:maxObjects></vim:options>
    </vim:RetrievePropertiesEx>
  </soapenv:Body>
</soapenv:Envelope>`;

    const r = await http('POST', '/sdk', {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'urn:vim25/6.0', 'Cookie': cookie,
    }, xml);

    if (r.status === 401) { _soapCookie = null; throw new Error('SOAP 401'); }
    if (r.status !== 200) throw new Error(`SOAP HTTP ${r.status}`);

    console.log(`[vSphere SOAP] ${moType} response bytes:`, r.body.length);

    const results = {};
    const retRe = /<returnval>([\s\S]*?)<\/returnval>/g;
    let retM;
    let _firstPropLog = true;
    while ((retM = retRe.exec(r.body)) !== null) {
        const block = retM[1];
        const objM  = block.match(/<obj[^>]*>([^<]+)<\/obj>/);
        if (!objM) continue;
        const moRef = objM[1].trim();
        results[moRef] = {};

        const psRe = /<propSet>([\s\S]*?)<\/propSet>/g;
        let psM;
        while ((psM = psRe.exec(block)) !== null) {
            const pb = psM[1];
            // Log one raw propSet block so we can see the exact XML tag vSphere uses
            if (_firstPropLog) {
                _firstPropLog = false;
                console.log('[SOAP propSet sample]:', pb.replace(/\n/g,' ').slice(0,300));
            }
            // Try every known vSphere SOAP property name tag variant
            const nameM = pb.match(/<name>([^<]+)<\/name>/)
                       || pb.match(/<n>([^<]+)<\/n>/);
            const valM = pb.match(/<val[^>]*>([\s\S]*?)<\/val>/);
            if (nameM && valM) {
                results[moRef][nameM[1].trim()] = valM[1].replace(/<[^>]+>/g,'').trim();
            }
        }
    }

    const count = Object.keys(results).length;
    console.log(`[vSphere SOAP] Parsed ${count} ${moType} objects`);
    if (count > 0) {
        const [k,v] = Object.entries(results)[0];
        console.log(`[vSphere SOAP] Sample ${k}:`, JSON.stringify(v));
    } else {
        console.warn('[vSphere SOAP] 0 objects parsed. Raw snippet:', r.body.slice(0, 600));
    }
    return results;
}

const num    = (v, f=0) => { const n = parseFloat(v); return isNaN(n) ? f : n; };
const gbToTB = gb => gb ? Math.round(gb / 1024 * 100) / 100 : 0;


// ── SOAP: fetch ONE host directly by its MoRef ────────────────────
async function soapFetchHostDirect(moRef) {
    const cookie = await soapSession();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:vim="urn:vim25">
  <soapenv:Body>
    <vim:RetrievePropertiesEx>
      <vim:_this type="PropertyCollector">propertyCollector</vim:_this>
      <vim:specSet>
        <vim:propSet>
          <vim:type>HostSystem</vim:type>
          <vim:pathSet>summary.hardware.numCpuCores</vim:pathSet>
          <vim:pathSet>summary.hardware.cpuMhz</vim:pathSet>
          <vim:pathSet>summary.hardware.memorySize</vim:pathSet>
          <vim:pathSet>summary.quickStats.overallCpuUsage</vim:pathSet>
          <vim:pathSet>summary.quickStats.overallMemoryUsage</vim:pathSet>
        </vim:propSet>
        <vim:objectSet>
          <vim:obj type="HostSystem">${moRef}</vim:obj>
          <vim:skip>false</vim:skip>
        </vim:objectSet>
      </vim:specSet>
      <vim:options></vim:options>
    </vim:RetrievePropertiesEx>
  </soapenv:Body>
</soapenv:Envelope>`;

    const r = await http('POST', '/sdk', {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'urn:vim25/6.0', 'Cookie': cookie,
    }, xml);

    if (r.status !== 200) { console.warn('[SOAP direct] HTTP', r.status, 'for', moRef); return {}; }

    // Log raw XML for first host so we can verify tag names
    const fp = r.body.indexOf('<propSet>');
    if (fp >= 0) console.log('[SOAP direct] propSet XML sample:', r.body.slice(fp, fp+250));

    const props = {};
    const psRe = /<propSet>([\s\S]*?)<\/propSet>/g;
    let pm;
    while ((pm = psRe.exec(r.body)) !== null) {
        const pb = pm[1];
        // Try every known tag name for property name in SOAP response
        const nameM = pb.match(/<name>([^<]+)<\/name>/)
                   || pb.match(/<n>([^<]+)<\/n>/);
        const valM  = pb.match(/<val[^>]*>([\s\S]*?)<\/val>/);
        if (nameM && valM) {
            props[nameM[1].trim()] = valM[1].replace(/<[^>]+>/g,'').trim();
        }
    }
    console.log('[SOAP direct]', moRef, '→', JSON.stringify(props));
    return props;
}

// ── HOSTS ─────────────────────────────────────────────────────────
async function getHosts() {
    const cached = fromCache('hosts');
    if (cached) return cached;
    try {
        const data     = await vcGet('/rest/vcenter/host');
        const rawHosts = data.value || [];
        console.log('[vSphere] REST hosts:', rawHosts.map(h=>`${h.name}(${h.host})`).join(', '));

        // Strategy 1: SOAP bulk traversal
        let soap = {};
        try {
            soap = await soapBulkFetch('HostSystem', [
                'summary.hardware.numCpuCores',
                'summary.hardware.cpuMhz',
                'summary.hardware.memorySize',
                'summary.quickStats.overallCpuUsage',
                'summary.quickStats.overallMemoryUsage',
            ]);
        } catch(e) { console.warn('[vSphere] Bulk SOAP failed:', e.message); }

        // Strategy 2: Direct SOAP per-host for any missing
        for (const h of rawHosts) {
            if (!soap[h.host] || Object.keys(soap[h.host]).length === 0) {
                console.log('[vSphere] Direct SOAP for', h.name, h.host);
                try { soap[h.host] = await soapFetchHostDirect(h.host); }
                catch(e) { console.warn('[vSphere] Direct SOAP failed for', h.host, e.message); }
            }
        }

        // Strategy 3: REST /api/vcenter/host/{id} (vCenter 7+)
        for (const h of rawHosts) {
            const sp = soap[h.host] || {};
            if (!sp['summary.hardware.numCpuCores']) {
                try {
                    const d = await vcGet('/api/vcenter/host/' + h.host);
                    if (d && d.cpu_cores) {
                        soap[h.host] = soap[h.host] || {};
                        soap[h.host]['summary.hardware.numCpuCores'] = String(d.cpu_cores || 0);
                        soap[h.host]['summary.hardware.cpuMhz']      = String(d.cpu_speed || 0);
                        soap[h.host]['summary.hardware.memorySize']   = String((d.memory_size_MiB || 0) * 1048576);
                        console.log('[vSphere] /api/vcenter/host', h.name, ':', d.cpu_cores, 'cores', d.memory_size_MiB, 'MiB');
                    }
                } catch(_) {}
            }
        }

        const hosts = rawHosts.map(h => {
            const hostId = h.host || '';
            const name   = h.name || hostId;
            const sp     = soap[hostId] || {};

            const cpuCores    = num(sp['summary.hardware.numCpuCores']);
            const cpuSpeedMHz = num(sp['summary.hardware.cpuMhz']);
            const memBytes    = num(sp['summary.hardware.memorySize']);
            const totalMemGB  = memBytes > 0 ? Math.round(memBytes / 1073741824) : 0;
            const cpuUseMHz   = num(sp['summary.quickStats.overallCpuUsage']);
            const memUseMiB   = num(sp['summary.quickStats.overallMemoryUsage']);

            const cpuCap = cpuCores * cpuSpeedMHz;
            const memCap = totalMemGB * 1024;
            const cpuPct = (cpuCap>0&&cpuUseMHz>0) ? Math.min(100,Math.round(cpuUseMHz/cpuCap*100)) : 0;
            const memPct = (memCap>0&&memUseMiB>0) ? Math.min(100,Math.round(memUseMiB/memCap*100)) : 0;

            console.log(`[vSphere] ${name}(${hostId}): ${cpuCores}c@${cpuSpeedMHz}MHz ${totalMemGB}GB CPU${cpuPct}% MEM${memPct}% [${Object.keys(sp).length} soap props]`);

            return {
                hostId, name,
                connectionState: (h.connection_state||'CONNECTED').toUpperCase(),
                powerState:      (h.power_state||'POWERED_ON').toUpperCase(),
                cpuCores, cpuSpeedMHz,
                totalMemoryGB:      totalMemGB,
                cpuUsagePercent:    cpuPct,
                memoryUsagePercent: memPct,
            };
        });

        return toCache('hosts', { hosts });
    } catch(err) {
        console.error('[vSphere] getHosts error:', err.message);
        return { hosts: [] };
    }
}

// ── VMs ───────────────────────────────────────────────────────────
async function getVMs(options = {}) {
    const { forceRefresh = false } = options;
    const cached = forceRefresh ? null : fromCache('vms');
    if (cached) return cached;
    try {
        // Build hostMoRef → hostName map from REST
        let hostNameMap = {};
        let rawHosts    = [];
        try {
            const hd = await vcGet('/rest/vcenter/host');
            rawHosts = hd.value || [];
            rawHosts.forEach(h => { if (h.host && h.name) hostNameMap[h.host] = h.name; });
        } catch(_) {}
        console.log('[vSphere] hostNameMap:', JSON.stringify(hostNameMap));

        // Strategy 1: SOAP bulk fetch — gets runtime.host (host MoRef) for every VM
        let vmHostMap  = {};  // vmMoRef → hostMoRef
        let vmStateMap = {};  // vmMoRef → powerState string
        let soapWorked = false;
        try {
            const vmSoap = await soapBulkFetch('VirtualMachine', [
                'name', 'runtime.host', 'runtime.powerState',
            ]);
            for (const [vmMoRef, props] of Object.entries(vmSoap)) {
                if (props['runtime.host'])       vmHostMap[vmMoRef]  = props['runtime.host'];
                if (props['runtime.powerState']) vmStateMap[vmMoRef] = props['runtime.powerState'];
            }
            soapWorked = Object.keys(vmSoap).length > 0;
            console.log('[vSphere] SOAP VMs parsed:', Object.keys(vmSoap).length);
            const sample = Object.entries(vmSoap)[0];
            if (sample) console.log('[vSphere] SOAP VM[0]:', sample[0], JSON.stringify(sample[1]));
        } catch(e) {
            console.warn('[vSphere] SOAP VM fetch failed:', e.message);
        }

        // Strategy 2 fallback: REST per-host filter (when SOAP returns 0 VMs)
        if (!soapWorked && rawHosts.length > 0) {
            console.log('[vSphere] SOAP got 0 VMs — falling back to REST per-host filter');
            for (const h of rawHosts) {
                try {
                    const hVMs = await vcGet('/rest/vcenter/vm?filter.hosts=' + h.host);
                    (hVMs.value || []).forEach(v => {
                        if (v.vm && !vmHostMap[v.vm]) vmHostMap[v.vm] = h.host;
                    });
                } catch(_) {}
            }
            console.log('[vSphere] REST fallback vmHostMap entries:', Object.keys(vmHostMap).length);
        }

        // Get full VM list from REST
        const data   = await vcGet('/rest/vcenter/vm');
        const rawVMs = data.value || [];

        let running=0, stopped=0, suspended=0;
        const list = rawVMs.map(v => {
            const vmMoRef   = v.vm || '';
            const hostMoRef = vmHostMap[vmMoRef] || '';
            const hostName  = hostNameMap[hostMoRef] || '';

            // Normalize: SOAP returns poweredOn/poweredOff, REST returns POWERED_ON/POWERED_OFF
            let ps = (vmStateMap[vmMoRef] || v.power_state || '').replace(/[_]/g,'').toUpperCase();
            if      (ps === 'POWEREDON')  ps = 'POWERED_ON';
            else if (ps === 'POWEREDOFF') ps = 'POWERED_OFF';
            else if (ps === 'SUSPENDED')  ps = 'SUSPENDED';
            else                          ps = 'POWERED_OFF';

            if      (ps === 'POWERED_ON')  running++;
            else if (ps === 'SUSPENDED')   suspended++;
            else                           stopped++;

            return {
                name:       v.name || 'VM',
                powerState: ps,
                memory:     num(v.memory_size_MiB || 0),
                cpuCount:   num(v.cpu_count || 0),
                hostId:     hostMoRef,             // MoRef e.g. "host-15"
                host:       hostName || hostMoRef,  // IP e.g. "10.10.10.65"
            };
        });

        console.log(`[vSphere] ${list.length} VMs — running:${running} stopped:${stopped}`);
        if (list[0]) console.log('[vSphere] VM[0]:', JSON.stringify(list[0]));

        return toCache('vms', { total: rawVMs.length, running, stopped, suspended, list });
    } catch(err) {
        console.error('[vSphere] getVMs error:', err.message);
        return { total:0, running:0, stopped:0, suspended:0, list:[], error: err.message };
    }
}

// ── DATASTORES ────────────────────────────────────────────────────
async function getDatastores() {
    const cached = fromCache('datastores');
    if (cached) return cached;
    try {
        const data = await vcGet('/rest/vcenter/datastore');
        let totalCapGB=0, totalUsedGB=0;
        const datastores = (data.value || []).map(d => {
            const capGB  = Math.round(num(d.capacity)    / (1024**3) * 10) / 10;
            const freeGB = Math.max(0, Math.round(num(d.free_space) / (1024**3) * 10) / 10);
            const usedGB = Math.max(0, Math.round((capGB - freeGB) * 10) / 10);
            totalCapGB  += capGB;
            totalUsedGB += usedGB;
            return { name: d.name||'DS', type: d.type||'VMFS', capacityGB: capGB,
                     usedSpaceGB: usedGB, freeSpaceGB: freeGB,
                     usagePercent: capGB>0 ? Math.min(100, Math.round(usedGB/capGB*100)) : 0 };
        });
        return toCache('datastores', {
            totalCapacityTB: Math.round(gbToTB(totalCapGB)*100)/100,
            totalUsedTB:     Math.round(gbToTB(totalUsedGB)*100)/100,
            overallUsagePct: totalCapGB>0 ? Math.round(totalUsedGB/totalCapGB*100) : 0,
            datastores,
        });
    } catch(err) {
        console.error('[vSphere] getDatastores error:', err.message);
        return { totalCapacityTB:0, totalUsedTB:0, overallUsagePct:0, datastores:[] };
    }
}

// ── REALTIME ──────────────────────────────────────────────────────
async function getRealtime() {
    const cached = fromCache('realtime');
    if (cached) return cached;
    try {
        const [hd, vd, dd] = await Promise.all([getHosts(), getVMs(), getDatastores()]);
        const hosts = hd.hosts || [];
        const totalCores  = hosts.reduce((s,h) => s+(h.cpuCores||0), 0);
        const totalMemGB  = hosts.reduce((s,h) => s+(h.totalMemoryGB||0), 0);
        const avgSpeedGHz = hosts.length ? Math.round(hosts.reduce((s,h)=>s+(h.cpuSpeedMHz||0),0)/hosts.length/100)/10 : 0;
        const cpuH = hosts.filter(h => h.cpuUsagePercent > 0);
        const memH = hosts.filter(h => h.memoryUsagePercent > 0);
        return toCache('realtime', {
            compute: {
                cpuUsagePercent:    cpuH.length ? Math.min(100,Math.round(cpuH.reduce((s,h)=>s+h.cpuUsagePercent,0)/cpuH.length)) : 0,
                memoryUsagePercent: memH.length ? Math.min(100,Math.round(memH.reduce((s,h)=>s+h.memoryUsagePercent,0)/memH.length)) : 0,
                totalMemoryGB: totalMemGB, cpuSpeedGHz: avgSpeedGHz, totalCores,
            },
            storage:     { usagePercent: dd.overallUsagePct||0, totalTB: dd.totalCapacityTB||0, usedTB: dd.totalUsedTB||0 },
            power:       { currentKW: 0 },
            vms:         { total: vd.total||0, running: vd.running||0, stopped: vd.stopped||0, suspended: vd.suspended||0 },
            hosts:       hosts.length,
            environment: { temperatureC: 0 },
        });
    } catch(err) {
        console.error('[vSphere] getRealtime error:', err.message);
        return { compute:{cpuUsagePercent:0,memoryUsagePercent:0,totalMemoryGB:0,cpuSpeedGHz:0,totalCores:0},
                 storage:{usagePercent:0,totalTB:0,usedTB:0}, power:{currentKW:0},
                 vms:{total:0,running:0,stopped:0,suspended:0}, hosts:0, environment:{temperatureC:0} };
    }
}

// ── ALERTS ────────────────────────────────────────────────────────
async function getAlerts() {
    const cached = fromCache('alerts');
    if (cached) return cached;

    if (isDbConfigured()) {
        try {
            const alerts = await getRecentAlertSnapshots(20);
            if (alerts.length) {
                return toCache('alerts', { alerts });
            }
        } catch (error) {
            console.warn('[vSphere] DB alert fetch failed:', error.message);
        }
    }

    const alerts=[], now=new Date().toISOString();
    try {
        const {hosts} = await getHosts();
        hosts.forEach(h => {
            if (h.connectionState!=='CONNECTED') alerts.push({type:'HOST',severity:'critical',message:`Host ${h.name} is ${h.connectionState}`,timestamp:now});
            else if (h.cpuUsagePercent>=90)      alerts.push({type:'PERFORMANCE',severity:'warning',message:`Host ${h.name} CPU at ${h.cpuUsagePercent}%`,timestamp:now});
            else if (h.memoryUsagePercent>=90)   alerts.push({type:'PERFORMANCE',severity:'warning',message:`Host ${h.name} Memory at ${h.memoryUsagePercent}%`,timestamp:now});
        });
    } catch(_) {}
    try {
        const {datastores} = await getDatastores();
        datastores.forEach(d => {
            if (d.usagePercent>=90) alerts.push({type:'STORAGE',severity:'critical',message:`Datastore ${d.name} is ${d.usagePercent}% full`,timestamp:now});
            else if (d.usagePercent>=80) alerts.push({type:'STORAGE',severity:'warning',message:`Datastore ${d.name} is ${d.usagePercent}% full`,timestamp:now});
        });
    } catch(_) {}
    if (!alerts.length) alerts.push({type:'SYSTEM',severity:'info',message:'All systems healthy',timestamp:now});
    return toCache('alerts', { alerts });
}

// ── NETWORKS ──────────────────────────────────────────────────────
async function getNetworks() {
    const cached = fromCache('networks');
    if (cached) return cached;
    try {
        const d = await vcGet('/rest/vcenter/network');
        return toCache('networks', { networks: (d.value||[]).map(n=>({name:n.name||'Network',type:n.type||'STANDARD_PORTGROUP'})) });
    } catch(err) { return { networks:[] }; }
}

module.exports = { getRealtime, getHosts, getVMs, getDatastores, getAlerts, getNetworks };
