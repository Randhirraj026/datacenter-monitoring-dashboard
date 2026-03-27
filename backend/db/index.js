const { Pool } = require('pg');

const TWO_MINUTES_MS = 2 * 60 * 1000;

const pool = process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE
    ? new Pool({
        host: process.env.PGHOST,
        port: Number(process.env.PGPORT || 5432),
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD || '',
        database: process.env.PGDATABASE,
        ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
      })
    : null;

const bootstrapSql = `
CREATE TABLE IF NOT EXISTS hosts (
  id BIGSERIAL PRIMARY KEY,
  host_name TEXT NOT NULL UNIQUE,
  total_cores INTEGER DEFAULT 0,
  total_memory_gb INTEGER DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS virtual_machines (
  id BIGSERIAL PRIMARY KEY,
  vm_name TEXT NOT NULL UNIQUE,
  host_id BIGINT REFERENCES hosts(id),
  status TEXT NOT NULL DEFAULT 'STOPPED',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_created_at TIMESTAMPTZ,
  source_deleted_at TIMESTAMPTZ,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS datastores (
  id BIGSERIAL PRIMARY KEY,
  datastore_name TEXT NOT NULL UNIQUE,
  datastore_type TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS host_metrics (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  host_id BIGINT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  cpu_usage_pct NUMERIC(5,2) DEFAULT 0,
  memory_usage_pct NUMERIC(5,2) DEFAULT 0,
  power_kw NUMERIC(10,3),
  temperature_c NUMERIC(5,2),
  status TEXT NOT NULL DEFAULT 'Normal'
);

CREATE TABLE IF NOT EXISTS datastore_metrics (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  datastore_id BIGINT NOT NULL REFERENCES datastores(id) ON DELETE CASCADE,
  total_capacity_gb NUMERIC(14,2) DEFAULT 0,
  used_space_gb NUMERIC(14,2) DEFAULT 0,
  free_space_gb NUMERIC(14,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Normal'
);

CREATE TABLE IF NOT EXISTS vm_events (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  vm_id BIGINT NOT NULL REFERENCES virtual_machines(id) ON DELETE CASCADE,
  host_id BIGINT REFERENCES hosts(id),
  vm_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alert_snapshots (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS networks (
  id BIGSERIAL PRIMARY KEY,
  network_name TEXT NOT NULL UNIQUE,
  network_type TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS network_snapshots (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  network_id BIGINT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'Active'
);

CREATE TABLE IF NOT EXISTS ilo_servers (
  id BIGSERIAL PRIMARY KEY,
  host_id BIGINT REFERENCES hosts(id) ON DELETE SET NULL,
  server_name TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  model TEXT,
  serial TEXT,
  bios TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ilo_server_metrics (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  ilo_server_id BIGINT NOT NULL REFERENCES ilo_servers(id) ON DELETE CASCADE,
  reachable BOOLEAN NOT NULL DEFAULT FALSE,
  health TEXT,
  inlet_temp_c NUMERIC(5,2),
  cpu_temp_c NUMERIC(5,2),
  power_kw NUMERIC(10,3),
  power_capacity_kw NUMERIC(10,3),
  memory_total_gb NUMERIC(10,2),
  processor_model TEXT,
  processor_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ilo_psu_metrics (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  ilo_server_id BIGINT NOT NULL REFERENCES ilo_servers(id) ON DELETE CASCADE,
  psu_name TEXT,
  status TEXT,
  state TEXT,
  input_watts NUMERIC(10,2)
);

CREATE TABLE IF NOT EXISTS ilo_fan_metrics (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  ilo_server_id BIGINT NOT NULL REFERENCES ilo_servers(id) ON DELETE CASCADE,
  fan_name TEXT,
  status TEXT,
  reading_value NUMERIC(10,2),
  reading_unit TEXT
);

CREATE TABLE IF NOT EXISTS ilo_storage_metrics (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  ilo_server_id BIGINT NOT NULL REFERENCES ilo_servers(id) ON DELETE CASCADE,
  controller_name TEXT,
  status TEXT,
  drive_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_host_metrics_host_ts ON host_metrics(host_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_datastore_metrics_ds_ts ON datastore_metrics(datastore_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_vm_events_vm_ts ON vm_events(vm_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_vm_events_type_ts ON vm_events(event_type, ts DESC);
CREATE INDEX IF NOT EXISTS idx_alert_snapshots_ts ON alert_snapshots(ts DESC);
CREATE INDEX IF NOT EXISTS idx_network_snapshots_network_ts ON network_snapshots(network_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ilo_server_metrics_server_ts ON ilo_server_metrics(ilo_server_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ilo_psu_metrics_server_ts ON ilo_psu_metrics(ilo_server_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ilo_fan_metrics_server_ts ON ilo_fan_metrics(ilo_server_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ilo_storage_metrics_server_ts ON ilo_storage_metrics(ilo_server_id, ts DESC);
`;

function isDbConfigured() {
    return Boolean(pool);
}

function keyify(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function deriveHealth(cpu, memory, temp) {
    if (cpu >= 90 || memory >= 92 || temp >= 42) return 'Critical';
    if (cpu >= 75 || memory >= 80 || temp >= 35) return 'Warning';
    return 'Normal';
}

function normalizeVmStatus(powerState) {
    return String(powerState || '').includes('ON') ? 'RUNNING' : 'STOPPED';
}

function parseTimeWindow(filters = {}) {
    const end = filters.customTo ? new Date(filters.customTo) : new Date();
    let start = filters.customFrom ? new Date(filters.customFrom) : new Date(end);

    if (!filters.customFrom || !filters.customTo) {
        if (filters.range === '15m') start = new Date(end.getTime() - 15 * 60 * 1000);
        else if (filters.range === '1h') start = new Date(end.getTime() - 60 * 60 * 1000);
        else if (filters.range === '6h') start = new Date(end.getTime() - 6 * 60 * 60 * 1000);
        else if (filters.range === '24h') start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
        else if (filters.range === '7d') start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
        else start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    }

    return { start, end };
}

function normalizeSortDirection(value) {
    return String(value || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
}

function toPositiveInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatPointLabel(date) {
    const d = new Date(date);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function initDb() {
    if (!pool) {
        console.warn('[DB] PostgreSQL is not configured. Set PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD in backend/.env');
        return false;
    }

    await pool.query(bootstrapSql);
    console.log('[DB] Schema ready');
    return true;
}

async function getHostIdMap(client, hosts) {
    const map = new Map();

    for (const host of hosts) {
        const result = await client.query(
            `INSERT INTO hosts (host_name, total_cores, total_memory_gb, is_active, updated_at)
             VALUES ($1, $2, $3, TRUE, now())
             ON CONFLICT (host_name)
             DO UPDATE SET total_cores = EXCLUDED.total_cores,
                           total_memory_gb = EXCLUDED.total_memory_gb,
                           is_active = TRUE,
                           updated_at = now()
             RETURNING id`,
            [host.name, host.cpuCores || 0, host.totalMemoryGB || 0]
        );

        map.set(host.name, result.rows[0].id);
    }

    return map;
}

async function getDatastoreIdMap(client, datastores) {
    const map = new Map();

    for (const datastore of datastores) {
        const result = await client.query(
            `INSERT INTO datastores (datastore_name, datastore_type, is_active, updated_at)
             VALUES ($1, $2, TRUE, now())
             ON CONFLICT (datastore_name)
             DO UPDATE SET datastore_type = EXCLUDED.datastore_type,
                           is_active = TRUE,
                           updated_at = now()
             RETURNING id`,
            [datastore.name, datastore.type || 'VMFS']
        );

        map.set(datastore.name, result.rows[0].id);
    }

    return map;
}

function mapIloByHost(hosts, iloPayload) {
    const map = new Map();
    const hostKeys = new Map(hosts.map((host) => [keyify(host.name), host.name]));

    (iloPayload?.servers || []).forEach((server, index) => {
        const exact = hostKeys.get(keyify(server.serverName));
        if (exact) {
            map.set(exact, server);
            return;
        }

        const fallbackHost = hosts[index];
        if (fallbackHost) {
            map.set(fallbackHost.name, server);
        }
    });

    return map;
}

async function getNetworkIdMap(client, networks) {
    const map = new Map();

    for (const network of networks) {
        const result = await client.query(
            `INSERT INTO networks (network_name, network_type, is_active, updated_at)
             VALUES ($1, $2, TRUE, now())
             ON CONFLICT (network_name)
             DO UPDATE SET network_type = EXCLUDED.network_type,
                           is_active = TRUE,
                           updated_at = now()
             RETURNING id`,
            [network.name, network.type || 'STANDARD_PORTGROUP']
        );

        map.set(network.name, result.rows[0].id);
    }

    return map;
}

async function getIloServerIdMap(client, hosts, hostIdMap, iloPayload) {
    const map = new Map();
    const iloMap = mapIloByHost(hosts || [], iloPayload || {});

    for (const [hostName, server] of iloMap.entries()) {
        const result = await client.query(
            `INSERT INTO ilo_servers (host_id, server_name, ip_address, model, serial, bios, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, now())
             ON CONFLICT (server_name)
             DO UPDATE SET host_id = EXCLUDED.host_id,
                           ip_address = EXCLUDED.ip_address,
                           model = EXCLUDED.model,
                           serial = EXCLUDED.serial,
                           bios = EXCLUDED.bios,
                           updated_at = now()
             RETURNING id`,
            [
                hostIdMap.get(hostName) || null,
                server.serverName || hostName,
                server.ip || null,
                server.model || null,
                server.serial || null,
                server.bios || null,
            ]
        );

        map.set(hostName, result.rows[0].id);
    }

    return map;
}

async function storeAlertSnapshot(client, alerts, now) {
    for (const alert of alerts || []) {
        await client.query(
            `INSERT INTO alert_snapshots (ts, alert_type, severity, message)
             VALUES ($1, $2, $3, $4)`,
            [
                now,
                alert.type || 'SYSTEM',
                alert.severity || 'info',
                alert.message || 'No message',
            ]
        );
    }
}

async function storeNetworkSnapshot(client, networks, now) {
    if (!networks?.length) return;

    const networkIdMap = await getNetworkIdMap(client, networks);

    for (const network of networks) {
        await client.query(
            `INSERT INTO network_snapshots (ts, network_id, status)
             VALUES ($1, $2, $3)`,
            [now, networkIdMap.get(network.name), 'Active']
        );
    }
}

async function storeIloSnapshot(client, hosts, hostIdMap, iloPayload, now) {
    const iloMap = mapIloByHost(hosts || [], iloPayload || {});
    const iloServerIdMap = await getIloServerIdMap(client, hosts || [], hostIdMap, iloPayload || {});

    for (const [hostName, server] of iloMap.entries()) {
        const iloServerId = iloServerIdMap.get(hostName);
        if (!iloServerId) continue;

        const powerKw = server?.power?.consumedWatts != null ? Number((server.power.consumedWatts / 1000).toFixed(3)) : null;
        const powerCapacityKw = server?.power?.capacityWatts != null ? Number((server.power.capacityWatts / 1000).toFixed(3)) : null;

        await client.query(
            `INSERT INTO ilo_server_metrics (
                ts, ilo_server_id, reachable, health, inlet_temp_c, cpu_temp_c,
                power_kw, power_capacity_kw, memory_total_gb, processor_model, processor_count
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
                now,
                iloServerId,
                Boolean(server.reachable),
                server.health || (server.reachable ? 'Unknown' : 'Unreachable'),
                server.temperature?.inlet ?? null,
                server.temperature?.cpuAvg ?? null,
                powerKw,
                powerCapacityKw,
                server.memory?.totalGB ?? null,
                server.processor?.model || null,
                server.processor?.count || 0,
            ]
        );

        for (const psu of server.psus || []) {
            await client.query(
                `INSERT INTO ilo_psu_metrics (ts, ilo_server_id, psu_name, status, state, input_watts)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    now,
                    iloServerId,
                    psu.name || null,
                    psu.status || null,
                    psu.state || null,
                    psu.inputWatts ?? null,
                ]
            );
        }

        for (const fan of server.fans || []) {
            const readingValue = fan.rpm ?? fan.pct ?? null;
            const readingUnit = fan.rpm != null ? 'RPM' : fan.pct != null ? 'PERCENT' : null;

            await client.query(
                `INSERT INTO ilo_fan_metrics (ts, ilo_server_id, fan_name, status, reading_value, reading_unit)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    now,
                    iloServerId,
                    fan.name || null,
                    fan.status || null,
                    readingValue,
                    readingUnit,
                ]
            );
        }

        for (const controller of server.storage || []) {
            await client.query(
                `INSERT INTO ilo_storage_metrics (ts, ilo_server_id, controller_name, status, drive_count)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    now,
                    iloServerId,
                    controller.name || null,
                    controller.status || null,
                    controller.drives || 0,
                ]
            );
        }
    }
}

async function syncVirtualMachines(client, vms, hostIdMap, now) {
    if (!Array.isArray(vms) || vms.length === 0) return;

    const existingResult = await client.query(`
      SELECT vm.id, vm.vm_name, vm.host_id, vm.status, vm.is_deleted, h.host_name
      FROM virtual_machines vm
      LEFT JOIN hosts h ON h.id = vm.host_id
    `);

    const existingByName = new Map(existingResult.rows.map((row) => [row.vm_name, row]));
    const seenVmNames = new Set();

    for (const vm of vms) {
        const hostId = hostIdMap.get(vm.host) || null;
        const normalizedStatus = normalizeVmStatus(vm.powerState);
        const existing = existingByName.get(vm.name);
        seenVmNames.add(vm.name);

        if (!existing) {
            const inserted = await client.query(
                `INSERT INTO virtual_machines (vm_name, host_id, status, first_seen_at, last_seen_at, source_created_at, is_deleted)
                 VALUES ($1, $2, $3, $4, $4, $4, FALSE)
                 RETURNING id`,
                [vm.name, hostId, normalizedStatus, now]
            );

            await client.query(
                `INSERT INTO vm_events (ts, vm_id, host_id, vm_name, event_type, status)
                 VALUES ($1, $2, $3, $4, 'CREATED', $5)`,
                [now, inserted.rows[0].id, hostId, vm.name, normalizedStatus]
            );
            continue;
        }

        await client.query(
            `UPDATE virtual_machines
             SET host_id = $2,
                 status = $3,
                 last_seen_at = $4,
                 is_deleted = FALSE,
                 source_deleted_at = NULL
             WHERE id = $1`,
            [existing.id, hostId, normalizedStatus, now]
        );

        if (existing.is_deleted) {
            await client.query(
                `INSERT INTO vm_events (ts, vm_id, host_id, vm_name, event_type, status)
                 VALUES ($1, $2, $3, $4, 'CREATED', $5)`,
                [now, existing.id, hostId, vm.name, normalizedStatus]
            );
        } else if (existing.status !== normalizedStatus) {
            await client.query(
                `INSERT INTO vm_events (ts, vm_id, host_id, vm_name, event_type, status)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [now, existing.id, hostId, vm.name, normalizedStatus === 'RUNNING' ? 'POWER_ON' : 'POWER_OFF', normalizedStatus]
            );
        }
    }

    for (const row of existingResult.rows) {
        if (!row.is_deleted && !seenVmNames.has(row.vm_name)) {
            await client.query(
                `UPDATE virtual_machines
                 SET is_deleted = TRUE,
                     status = 'STOPPED',
                     source_deleted_at = $2
                 WHERE id = $1`,
                [row.id, now]
            );

            await client.query(
                `INSERT INTO vm_events (ts, vm_id, host_id, vm_name, event_type, status)
                 VALUES ($1, $2, $3, $4, 'DELETED', 'STOPPED')`,
                [now, row.id, row.host_id, row.vm_name]
            );
        }
    }
}

async function storeSnapshot({ hosts, vms, datastores, iloPayload, alerts, networks }) {
    if (!pool) return false;
    if ((!hosts || hosts.length === 0) && (!datastores || datastores.length === 0)) return false;

    const client = await pool.connect();
    const now = new Date();

    try {
        await client.query('BEGIN');

        const hostIdMap = await getHostIdMap(client, hosts || []);
        const datastoreIdMap = await getDatastoreIdMap(client, datastores || []);
        const iloMap = mapIloByHost(hosts || [], iloPayload || {});

        for (const host of hosts || []) {
            const iloServer = iloMap.get(host.name);
            const powerKw = iloServer?.power?.consumedWatts != null ? Number((iloServer.power.consumedWatts / 1000).toFixed(3)) : null;
            const temperatureC = iloServer?.temperature?.inlet ?? iloServer?.temperature?.cpuAvg ?? null;
            const status = deriveHealth(host.cpuUsagePercent || 0, host.memoryUsagePercent || 0, temperatureC || 0);

            await client.query(
                `INSERT INTO host_metrics (ts, host_id, cpu_usage_pct, memory_usage_pct, power_kw, temperature_c, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [now, hostIdMap.get(host.name), host.cpuUsagePercent || 0, host.memoryUsagePercent || 0, powerKw, temperatureC, status]
            );
        }

        for (const datastore of datastores || []) {
            await client.query(
                `INSERT INTO datastore_metrics (ts, datastore_id, total_capacity_gb, used_space_gb, free_space_gb, status)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    now,
                    datastoreIdMap.get(datastore.name),
                    datastore.capacityGB || 0,
                    datastore.usedSpaceGB || 0,
                    datastore.freeSpaceGB || 0,
                    datastore.usagePercent >= 85 ? 'Critical' : datastore.usagePercent >= 70 ? 'Warning' : 'Normal',
                ]
            );
        }

        await syncVirtualMachines(client, vms || [], hostIdMap, now);
        await storeAlertSnapshot(client, alerts || [], now);
        await storeNetworkSnapshot(client, networks || [], now);
        await storeIloSnapshot(client, hosts || [], hostIdMap, iloPayload || {}, now);

        await client.query('COMMIT');
        return true;
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[DB] storeSnapshot failed:', error.message);
        throw error;
    } finally {
        client.release();
    }
}

async function getSuperAdminBundle(filters = {}) {
    if (!pool) return null;

    const { start, end } = parseTimeWindow(filters);
    const baseParams = [start, end];
    const hostFilter = filters.hostId ? ` AND h.id = $3` : '';
    const datastoreFilter = filters.datastoreId ? ` AND d.id = $${filters.hostId ? 4 : 3}` : '';
    const vmFilter = filters.vmId ? ` AND vm.id = $${filters.hostId ? 4 : 3}` : '';

    const paramsForHostMetrics = filters.hostId ? [...baseParams, filters.hostId] : baseParams;
    const paramsForDatastoreMetrics = filters.datastoreId
        ? [...paramsForHostMetrics, filters.datastoreId]
        : paramsForHostMetrics;
    const paramsForVmEvents = filters.vmId ? [...paramsForHostMetrics, filters.vmId] : paramsForHostMetrics;

    const [hostsResult, vmsResult, datastoresResult, hostMetricsResult, datastoreMetricsResult, vmEventsResult] = await Promise.all([
        pool.query(`SELECT id, host_name AS name, total_cores, total_memory_gb FROM hosts WHERE is_active = TRUE ORDER BY host_name`),
        pool.query(`SELECT id, vm_name AS name, host_id FROM virtual_machines ORDER BY vm_name`),
        pool.query(`SELECT id, datastore_name AS name FROM datastores WHERE is_active = TRUE ORDER BY datastore_name`),
        pool.query(
            `SELECT hm.ts, hm.host_id, h.host_name, hm.cpu_usage_pct, hm.memory_usage_pct, hm.power_kw, hm.temperature_c, hm.status
             FROM host_metrics hm
             JOIN hosts h ON h.id = hm.host_id
             WHERE hm.ts BETWEEN $1 AND $2${hostFilter}
             ORDER BY hm.ts ASC`,
            paramsForHostMetrics
        ),
        pool.query(
            `SELECT dm.ts, dm.datastore_id, d.datastore_name, dm.total_capacity_gb, dm.used_space_gb, dm.free_space_gb, dm.status
             FROM datastore_metrics dm
             JOIN datastores d ON d.id = dm.datastore_id
             WHERE dm.ts BETWEEN $1 AND $2${datastoreFilter}
             ORDER BY dm.ts ASC`,
            paramsForDatastoreMetrics
        ),
        pool.query(
            `SELECT ev.id, ev.ts, ev.vm_id, ev.host_id, ev.vm_name, ev.event_type, ev.status, h.host_name
             FROM vm_events ev
             LEFT JOIN hosts h ON h.id = ev.host_id
             LEFT JOIN virtual_machines vm ON vm.id = ev.vm_id
             WHERE ev.ts BETWEEN $1 AND $2${vmFilter}
             ORDER BY ev.ts DESC`,
            paramsForVmEvents
        ),
    ]);

    const currentVmsResult = await pool.query(`
        SELECT id, status, is_deleted
        FROM virtual_machines
        WHERE is_deleted = FALSE
    `);

    const hostMetrics = hostMetricsResult.rows.map((row) => ({
        id: `${row.host_id}-${row.ts.toISOString()}`,
        ts: row.ts.toISOString(),
        hostId: row.host_id,
        hostName: row.host_name,
        cpuUsagePct: Number(row.cpu_usage_pct || 0),
        memoryUsagePct: Number(row.memory_usage_pct || 0),
        powerKw: row.power_kw != null ? Number(row.power_kw) : null,
        temperatureC: row.temperature_c != null ? Number(row.temperature_c) : null,
        status: row.status || 'Normal',
    }));

    const datastoreLogs = datastoreMetricsResult.rows.map((row) => ({
        id: `${row.datastore_id}-${row.ts.toISOString()}`,
        ts: row.ts.toISOString(),
        datastoreId: row.datastore_id,
        datastoreName: row.datastore_name,
        totalCapacityGb: Number(row.total_capacity_gb || 0),
        usedSpaceGb: Number(row.used_space_gb || 0),
        freeSpaceGb: Number(row.free_space_gb || 0),
        usedPct: row.total_capacity_gb > 0 ? Number(((row.used_space_gb / row.total_capacity_gb) * 100).toFixed(2)) : 0,
        status: row.status || 'Normal',
    }));

    const vmActivity = vmEventsResult.rows.map((row) => ({
        id: row.id,
        ts: row.ts.toISOString(),
        vmId: row.vm_id,
        vmName: row.vm_name,
        hostId: row.host_id,
        hostName: row.host_name || '-',
        eventType: row.event_type,
        status: row.status,
    }));

    const latestByHost = new Map();
    hostMetrics.forEach((row) => latestByHost.set(row.hostId, row));
    const latestHostRows = Array.from(latestByHost.values());

    const runningVms = currentVmsResult.rows.filter((row) => row.status === 'RUNNING').length;
    const stoppedVms = currentVmsResult.rows.filter((row) => row.status !== 'RUNNING').length;

    const vmLifecycleMap = new Map();
    vmActivity.forEach((row) => {
        const key = row.ts.slice(0, 10);
        const current = vmLifecycleMap.get(key) || { statDate: key, createdCount: 0, deletedCount: 0, runningCount: runningVms, stoppedCount: stoppedVms };
        if (row.eventType === 'CREATED') current.createdCount += 1;
        if (row.eventType === 'DELETED') current.deletedCount += 1;
        vmLifecycleMap.set(key, current);
    });

    const hourlyPowerMap = new Map();
    hostMetrics.forEach((row) => {
        const bucket = row.ts.slice(0, 13) + ':00';
        hourlyPowerMap.set(bucket, (hourlyPowerMap.get(bucket) || 0) + (row.powerKw || 0));
    });

    const selectedServer = latestHostRows.find((row) => String(row.hostId) === String(filters.hostId)) || latestHostRows[0] || null;
    const previousHourMemory = selectedServer
        ? hostMetrics.filter((row) => row.hostId === selectedServer.hostId && new Date(row.ts) >= new Date(end.getTime() - 60 * 60 * 1000)).slice(-12)
        : [];

    const currentVmInventory = await pool.query(`
        SELECT
            vm.id,
            vm.vm_name,
            vm.host_id,
            h.host_name,
            vm.status
        FROM virtual_machines vm
        LEFT JOIN hosts h ON h.id = vm.host_id
        WHERE vm.is_deleted = FALSE
        ORDER BY vm.vm_name
    `);

    return {
        filters: {
            hosts: hostsResult.rows.map((row) => ({ id: row.id, name: row.name, totalMemory: `${row.total_memory_gb} GB` })),
            vms: vmsResult.rows,
            datastores: datastoresResult.rows,
        },
        summary: {
            totalHosts: hostsResult.rows.length,
            totalVms: runningVms + stoppedVms,
            runningVms,
            stoppedVms,
            avgPowerKw: latestHostRows.length ? Number((latestHostRows.reduce((sum, row) => sum + (row.powerKw || 0), 0) / latestHostRows.length).toFixed(2)) : 0,
            warningCount: latestHostRows.filter((row) => row.status === 'Warning').length,
            criticalCount: latestHostRows.filter((row) => row.status === 'Critical').length,
            totalCores: hostsResult.rows.reduce((sum, row) => sum + (row.total_cores || 0), 0),
            totalMemory: `${hostsResult.rows.reduce((sum, row) => sum + (row.total_memory_gb || 0), 0)} GB`,
            totalStorage: `${(datastoreLogs.reduce((sum, row) => sum + row.totalCapacityGb, 0) / 1024).toFixed(2)} TB`,
        },
        charts: {
            hostMetrics,
            datastoreUsage: datastoreLogs,
            vmLifecycle: Array.from(vmLifecycleMap.values()).sort((a, b) => a.statDate.localeCompare(b.statDate)),
            overallPowerHourly: Array.from(hourlyPowerMap.entries()).map(([bucket, totalKw]) => ({ bucket, totalKw: Number(totalKw.toFixed(2)) })),
            previousHourMemory,
        },
        tables: {
            hostMetrics: [...hostMetrics].sort((a, b) => new Date(b.ts) - new Date(a.ts)),
            vmActivity,
            powerLogs: [...hostMetrics]
                .filter((row) => row.powerKw != null)
                .map((row) => ({ id: `p-${row.id}`, ts: row.ts, hostId: row.hostId, hostName: row.hostName, powerKw: row.powerKw, status: row.status }))
                .sort((a, b) => new Date(b.ts) - new Date(a.ts)),
            datastoreLogs: [...datastoreLogs].sort((a, b) => new Date(b.ts) - new Date(a.ts)),
        },
        drilldowns: {
            hosts: hostsResult.rows.map((host) => ({
                id: host.id,
                hostName: host.name,
                details: host,
                history: hostMetrics.filter((row) => row.hostId === host.id).slice(-24),
            })),
            vms: vmsResult.rows.map((vm) => ({
                id: vm.id,
                vmName: vm.name,
                details: vm,
                history: vmActivity.filter((row) => row.vmId === vm.id),
            })),
        },
        currentVms: currentVmInventory.rows.map((row) => ({
            id: row.id,
            name: row.vm_name,
            hostId: row.host_id,
            hostName: row.host_name || '-',
            powerState: row.status === 'RUNNING' ? 'RUNNING' : 'STOPPED',
        })),
        selectedServer,
        labels: hostMetrics.map((row) => formatPointLabel(row.ts)),
        lastSnapshotAt: hostMetrics.at(-1)?.ts || null,
    };
}

function formatDashboardMemory(totalMemoryGb) {
    if (!totalMemoryGb) return null;
    return totalMemoryGb >= 1024
        ? `${(totalMemoryGb / 1024).toFixed(1)}TB`
        : `${Math.round(totalMemoryGb)}GB`;
}

async function getSuperAdminDashboardData() {
    if (!pool) return null;

    const [hostsResult, latestHostMetricsResult, currentVmsResult, latestDatastoresResult, powerHistoryResult] = await Promise.all([
        pool.query(`
            SELECT id, host_name AS name, total_cores, total_memory_gb
            FROM hosts
            WHERE is_active = TRUE
            ORDER BY host_name
        `),
        pool.query(`
            SELECT DISTINCT ON (hm.host_id)
                hm.host_id,
                hm.ts,
                h.host_name,
                h.total_cores,
                h.total_memory_gb,
                hm.cpu_usage_pct,
                hm.memory_usage_pct,
                hm.power_kw,
                hm.temperature_c,
                hm.status
            FROM host_metrics hm
            JOIN hosts h ON h.id = hm.host_id
            WHERE h.is_active = TRUE
            ORDER BY hm.host_id, hm.ts DESC
        `),
        pool.query(`
            SELECT
                vm.id,
                vm.vm_name,
                vm.host_id,
                h.host_name,
                vm.status,
                vm.is_deleted
            FROM virtual_machines vm
            LEFT JOIN hosts h ON h.id = vm.host_id
            WHERE vm.is_deleted = FALSE
            ORDER BY vm.vm_name
        `),
        pool.query(`
            SELECT DISTINCT ON (dm.datastore_id)
                dm.datastore_id,
                dm.ts,
                d.datastore_name,
                dm.total_capacity_gb,
                dm.used_space_gb,
                dm.free_space_gb,
                dm.status
            FROM datastore_metrics dm
            JOIN datastores d ON d.id = dm.datastore_id
            WHERE d.is_active = TRUE
            ORDER BY dm.datastore_id, dm.ts DESC
        `),
        pool.query(`
            WITH recent_points AS (
                SELECT DISTINCT ts
                FROM host_metrics
                ORDER BY ts DESC
                LIMIT 24
            )
            SELECT
                rp.ts,
                COALESCE(ROUND(SUM(hm.power_kw), 3), 0) AS total_power_kw
            FROM recent_points rp
            LEFT JOIN host_metrics hm ON hm.ts = rp.ts
            GROUP BY rp.ts
            ORDER BY rp.ts ASC
        `),
    ]);

    const hostRows = latestHostMetricsResult.rows.map((row) => {
        const totalMemoryGb = Number(row.total_memory_gb || 0);
        const memPct = Number(row.memory_usage_pct || 0);
        const memUsedGb = totalMemoryGb > 0 ? Number(((totalMemoryGb * memPct) / 100).toFixed(2)) : null;

        return {
            name: row.host_name,
            hostId: row.host_id,
            cpuPct: Number(row.cpu_usage_pct || 0),
            memPct,
            memUsedGB: memUsedGb,
            memTotalGB: totalMemoryGb,
            connectionState: 'connected',
            powerKw: row.power_kw != null ? Number(row.power_kw) : 0,
            temperatureC: row.temperature_c != null ? Number(row.temperature_c) : null,
            status: row.status || 'Normal',
            ts: row.ts,
        };
    });

    const totalCores = hostsResult.rows.reduce((sum, row) => sum + Number(row.total_cores || 0), 0);
    const totalMemoryGb = hostsResult.rows.reduce((sum, row) => sum + Number(row.total_memory_gb || 0), 0);
    const totalMemUsedGb = hostRows.reduce((sum, row) => sum + Number(row.memUsedGB || 0), 0);
    const cpuAverage = hostRows.length
        ? Number((hostRows.reduce((sum, row) => sum + Number(row.cpuPct || 0), 0) / hostRows.length).toFixed(2))
        : null;
    const memAverage = hostRows.length
        ? Number((hostRows.reduce((sum, row) => sum + Number(row.memPct || 0), 0) / hostRows.length).toFixed(2))
        : null;

    const datastores = latestDatastoresResult.rows.map((row) => ({
        name: row.datastore_name,
        totalCapacityGB: Number(row.total_capacity_gb || 0),
        usedSpaceGB: Number(row.used_space_gb || 0),
        freeSpaceGB: Number(row.free_space_gb || 0),
        usagePct: Number(row.total_capacity_gb || 0) > 0
            ? Number(((row.used_space_gb / row.total_capacity_gb) * 100).toFixed(2))
            : 0,
        status: row.status || 'Normal',
    }));

    const totalStorageGb = datastores.reduce((sum, row) => sum + Number(row.totalCapacityGB || 0), 0);
    const usedStorageGb = datastores.reduce((sum, row) => sum + Number(row.usedSpaceGB || 0), 0);
    const freeStorageGb = datastores.reduce((sum, row) => sum + Number(row.freeSpaceGB || 0), 0);
    const storagePct = totalStorageGb > 0 ? Number(((usedStorageGb / totalStorageGb) * 100).toFixed(2)) : null;

    const allVMs = currentVmsResult.rows.map((row) => ({
        id: row.id,
        name: row.vm_name,
        hostId: row.host_id,
        hostName: row.host_name || '-',
        powerState: row.status === 'RUNNING' ? 'RUNNING' : 'STOPPED',
    }));

    const vmRunning = currentVmsResult.rows.filter((row) => row.status === 'RUNNING').length;
    const vmStopped = currentVmsResult.rows.filter((row) => row.status !== 'RUNNING').length;

    const totalPowerKw = Number(hostRows.reduce((sum, row) => sum + Number(row.powerKw || 0), 0).toFixed(2));
    const peakPowerKw = powerHistoryResult.rows.reduce((max, row) => Math.max(max, Number(row.total_power_kw || 0)), 0);
    const hostsWithTemperature = hostRows.filter((row) => row.temperatureC != null);
    const avgInletTemp = hostsWithTemperature.length
        ? Number((
            hostsWithTemperature.reduce((sum, row) => sum + Number(row.temperatureC || 0), 0) /
            hostsWithTemperature.length
        ).toFixed(2))
        : null;

    const powerHistory = powerHistoryResult.rows.map((row) => ({
        t: new Date(row.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        v: Number(row.total_power_kw || 0),
    }));

    const iloServers = hostRows.map((row) => ({
        serverName: row.name,
        reachable: true,
        health: row.status === 'Critical' ? 'Critical' : row.status === 'Warning' ? 'Warning' : 'OK',
        temperature: {
            inlet: row.temperatureC,
            cpuAvg: row.temperatureC,
        },
        power: {
            consumedWatts: row.powerKw ? Math.round(row.powerKw * 1000) : 0,
        },
        memory: {
            totalGB: row.memTotalGB,
        },
        processor: {
            model: 'Stored DB Snapshot',
            count: hostsResult.rows.find((host) => host.id === row.hostId)?.total_cores || 0,
        },
        psus: [],
        fans: [],
        storage: [],
    }));

    return {
        cpuPct: cpuAverage,
        cpuCores: totalCores,
        cpuSpeed: null,
        hostsOnline: hostRows.length,
        memPct: memAverage,
        memUsed: totalMemUsedGb ? Number(totalMemUsedGb.toFixed(2)) : 0,
        memTotal: totalMemoryGb,
        memFree: Math.max(Number((totalMemoryGb - totalMemUsedGb).toFixed(2)), 0),
        storagePct,
        storageUsedTB: Number((usedStorageGb / 1024).toFixed(2)),
        storageTotalTB: Number((totalStorageGb / 1024).toFixed(2)),
        storageFreeTB: Number((freeStorageGb / 1024).toFixed(2)),
        datastoreCount: datastores.length,
        datastores,
        vmCount: allVMs.length,
        vmRunning,
        vmStopped,
        vmSuspended: 0,
        allVMs,
        hosts: hostRows,
        totalServers: hostRows.length,
        totalCores,
        totalMemory: formatDashboardMemory(totalMemoryGb),
        totalStorage: `${(totalStorageGb / 1024).toFixed(1)}TB`,
        iloServers,
        powerKW: totalPowerKw,
        powerCapKW: peakPowerKw > 0 ? peakPowerKw.toFixed(2) : null,
        powerPct: peakPowerKw > 0 ? Number(((totalPowerKw / peakPowerKw) * 100).toFixed(1)) : 0,
        powerPsuCount: null,
        powerPsuOk: null,
        powerHistory,
        inletTemp: avgInletTemp,
        alerts: [],
        serverNames: hostRows.slice(0, 3).map((row) => row.name),
        lastSnapshotAt: hostRows[0]?.ts ? new Date(hostRows[0].ts).toISOString() : null,
    };
}

async function getSuperAdminSectionDetails(filters = {}) {
    if (!pool) return null;

    const section = String(filters.section || '').toLowerCase();
    const { start, end } = parseTimeWindow(filters);
    const sortDirection = normalizeSortDirection(filters.sort);
    const page = toPositiveInt(filters.page, 1);
    const pageSize = Math.min(toPositiveInt(filters.pageSize, 50), 500);
    const offset = (page - 1) * pageSize;
    const hostId = filters.hostId ? Number(filters.hostId) : null;
    const hostFilter = Number.isFinite(hostId) ? ' AND h.id = $3' : '';
    const hostJoinFilter = Number.isFinite(hostId) ? ' AND s.host_id = $3' : '';
    const queryParams = Number.isFinite(hostId)
        ? [start, end, hostId, pageSize, offset]
        : [start, end, pageSize, offset];
    const limitParam = Number.isFinite(hostId) ? 4 : 3;
    const offsetParam = Number.isFinite(hostId) ? 5 : 4;

    const definitions = {
        cpu: {
            title: 'CPU Records',
            columns: [
                { key: 'timestamp', label: 'Timestamp' },
                { key: 'hostName', label: 'Host' },
                { key: 'cpuUsagePct', label: 'CPU Usage %' },
                { key: 'status', label: 'Status' },
            ],
            countSql: `
                SELECT COUNT(*)::int AS total
                FROM host_metrics hm
                JOIN hosts h ON h.id = hm.host_id
                WHERE hm.ts BETWEEN $1 AND $2${hostFilter}
            `,
            dataSql: `
                SELECT
                  hm.ts AS timestamp,
                  h.host_name AS "hostName",
                  ROUND(hm.cpu_usage_pct, 2) AS "cpuUsagePct",
                  hm.status AS status
                FROM host_metrics hm
                JOIN hosts h ON h.id = hm.host_id
                WHERE hm.ts BETWEEN $1 AND $2${hostFilter}
                ORDER BY hm.ts ${sortDirection}, h.host_name ASC
                LIMIT $${limitParam} OFFSET $${offsetParam}
            `,
        },
        memory: {
            title: 'Memory Records',
            columns: [
                { key: 'timestamp', label: 'Timestamp' },
                { key: 'hostName', label: 'Host' },
                { key: 'memoryUsagePct', label: 'Memory Usage %' },
                { key: 'status', label: 'Status' },
            ],
            countSql: `
                SELECT COUNT(*)::int AS total
                FROM host_metrics hm
                JOIN hosts h ON h.id = hm.host_id
                WHERE hm.ts BETWEEN $1 AND $2${hostFilter}
            `,
            dataSql: `
                SELECT
                  hm.ts AS timestamp,
                  h.host_name AS "hostName",
                  ROUND(hm.memory_usage_pct, 2) AS "memoryUsagePct",
                  hm.status AS status
                FROM host_metrics hm
                JOIN hosts h ON h.id = hm.host_id
                WHERE hm.ts BETWEEN $1 AND $2${hostFilter}
                ORDER BY hm.ts ${sortDirection}, h.host_name ASC
                LIMIT $${limitParam} OFFSET $${offsetParam}
            `,
        },
        storage: {
            title: 'Storage Records',
            columns: [
                { key: 'timestamp', label: 'Timestamp' },
                { key: 'datastoreName', label: 'Datastore' },
                { key: 'totalCapacityGb', label: 'Total GB' },
                { key: 'usedSpaceGb', label: 'Used GB' },
                { key: 'freeSpaceGb', label: 'Free GB' },
                { key: 'usedPct', label: 'Usage %' },
                { key: 'status', label: 'Status' },
            ],
            countSql: `
                SELECT COUNT(*)::int AS total
                FROM datastore_metrics dm
                JOIN datastores d ON d.id = dm.datastore_id
                WHERE dm.ts BETWEEN $1 AND $2
            `,
            dataSql: `
                SELECT
                  dm.ts AS timestamp,
                  d.datastore_name AS "datastoreName",
                  ROUND(dm.total_capacity_gb, 2) AS "totalCapacityGb",
                  ROUND(dm.used_space_gb, 2) AS "usedSpaceGb",
                  ROUND(dm.free_space_gb, 2) AS "freeSpaceGb",
                  CASE
                    WHEN dm.total_capacity_gb > 0 THEN ROUND((dm.used_space_gb / dm.total_capacity_gb) * 100, 2)
                    ELSE 0
                  END AS "usedPct",
                  dm.status AS status
                FROM datastore_metrics dm
                JOIN datastores d ON d.id = dm.datastore_id
                WHERE dm.ts BETWEEN $1 AND $2
                ORDER BY dm.ts ${sortDirection}, d.datastore_name ASC
                LIMIT $3 OFFSET $4
            `,
        },
        power: {
            title: 'Power Records',
            columns: [
                { key: 'timestamp', label: 'Timestamp' },
                { key: 'hostName', label: 'Host' },
                { key: 'powerKw', label: 'Power kW' },
                { key: 'status', label: 'Status' },
            ],
            countSql: `
                SELECT COUNT(*)::int AS total
                FROM host_metrics hm
                JOIN hosts h ON h.id = hm.host_id
                WHERE hm.ts BETWEEN $1 AND $2
                  ${hostFilter ? hostFilter.replace('AND', 'AND') : ''}
                  AND hm.power_kw IS NOT NULL
            `,
            dataSql: `
                SELECT
                  hm.ts AS timestamp,
                  h.host_name AS "hostName",
                  ROUND(hm.power_kw, 3) AS "powerKw",
                  hm.status AS status
                FROM host_metrics hm
                JOIN hosts h ON h.id = hm.host_id
                WHERE hm.ts BETWEEN $1 AND $2
                  ${hostFilter ? hostFilter.replace('AND', 'AND') : ''}
                  AND hm.power_kw IS NOT NULL
                ORDER BY hm.ts ${sortDirection}, h.host_name ASC
                LIMIT $${limitParam} OFFSET $${offsetParam}
            `,
        },
        temperature: {
            title: 'Temperature Records',
            columns: [
                { key: 'timestamp', label: 'Timestamp' },
                { key: 'hostName', label: 'Host' },
                { key: 'temperatureC', label: 'Temperature C' },
                { key: 'status', label: 'Status' },
            ],
            countSql: `
                SELECT COUNT(*)::int AS total
                FROM host_metrics hm
                JOIN hosts h ON h.id = hm.host_id
                WHERE hm.ts BETWEEN $1 AND $2
                  ${hostFilter ? hostFilter.replace('AND', 'AND') : ''}
                  AND hm.temperature_c IS NOT NULL
            `,
            dataSql: `
                SELECT
                  hm.ts AS timestamp,
                  h.host_name AS "hostName",
                  ROUND(hm.temperature_c, 2) AS "temperatureC",
                  hm.status AS status
                FROM host_metrics hm
                JOIN hosts h ON h.id = hm.host_id
                WHERE hm.ts BETWEEN $1 AND $2
                  ${hostFilter ? hostFilter.replace('AND', 'AND') : ''}
                  AND hm.temperature_c IS NOT NULL
                ORDER BY hm.ts ${sortDirection}, h.host_name ASC
                LIMIT $${limitParam} OFFSET $${offsetParam}
            `,
        },
        vm: {
            title: 'VM Activity Records',
            columns: [
                { key: 'timestamp', label: 'Timestamp' },
                { key: 'vmName', label: 'VM' },
                { key: 'hostName', label: 'Host' },
                { key: 'eventType', label: 'Event' },
                { key: 'status', label: 'Status' },
            ],
            countSql: `
                SELECT COUNT(*)::int AS total
                FROM vm_events ev
                LEFT JOIN hosts h ON h.id = ev.host_id
                WHERE ev.ts BETWEEN $1 AND $2${hostFilter}
            `,
            dataSql: `
                SELECT
                  ev.ts AS timestamp,
                  ev.vm_name AS "vmName",
                  COALESCE(h.host_name, '-') AS "hostName",
                  ev.event_type AS "eventType",
                  ev.status AS status
                FROM vm_events ev
                LEFT JOIN hosts h ON h.id = ev.host_id
                WHERE ev.ts BETWEEN $1 AND $2${hostFilter}
                ORDER BY ev.ts ${sortDirection}, ev.vm_name ASC
                LIMIT $${limitParam} OFFSET $${offsetParam}
            `,
        },
        alerts: {
            title: 'Alert Records',
            columns: [
                { key: 'timestamp', label: 'Timestamp' },
                { key: 'alertType', label: 'Type' },
                { key: 'severity', label: 'Severity' },
                { key: 'message', label: 'Message' },
            ],
            countSql: `
                SELECT COUNT(*)::int AS total
                FROM alert_snapshots
                WHERE ts BETWEEN $1 AND $2
            `,
            dataSql: `
                SELECT
                  ts AS timestamp,
                  alert_type AS "alertType",
                  severity,
                  message
                FROM alert_snapshots
                WHERE ts BETWEEN $1 AND $2
                ORDER BY ts ${sortDirection}, id ${sortDirection}
                LIMIT $3 OFFSET $4
            `,
        },
        network: {
            title: 'Network Records',
            columns: [
                { key: 'timestamp', label: 'Timestamp' },
                { key: 'networkName', label: 'Network' },
                { key: 'networkType', label: 'Type' },
                { key: 'status', label: 'Status' },
            ],
            countSql: `
                SELECT COUNT(*)::int AS total
                FROM network_snapshots ns
                JOIN networks n ON n.id = ns.network_id
                WHERE ns.ts BETWEEN $1 AND $2
            `,
            dataSql: `
                SELECT
                  ns.ts AS timestamp,
                  n.network_name AS "networkName",
                  n.network_type AS "networkType",
                  ns.status AS status
                FROM network_snapshots ns
                JOIN networks n ON n.id = ns.network_id
                WHERE ns.ts BETWEEN $1 AND $2
                ORDER BY ns.ts ${sortDirection}, n.network_name ASC
                LIMIT $3 OFFSET $4
            `,
        },
        ilo: {
            title: 'iLO Hardware Records',
            columns: [
                { key: 'timestamp', label: 'Timestamp' },
                { key: 'serverName', label: 'Server' },
                { key: 'reachable', label: 'Reachable' },
                { key: 'health', label: 'Health' },
                { key: 'inletTempC', label: 'Inlet C' },
                { key: 'cpuTempC', label: 'CPU C' },
                { key: 'powerKw', label: 'Power kW' },
                { key: 'memoryTotalGb', label: 'RAM GB' },
                { key: 'processorCount', label: 'CPU Count' },
            ],
            countSql: `
                SELECT COUNT(*)::int AS total
                FROM ilo_server_metrics ism
                JOIN ilo_servers s ON s.id = ism.ilo_server_id
                WHERE ism.ts BETWEEN $1 AND $2${hostJoinFilter}
            `,
            dataSql: `
                SELECT
                  ism.ts AS timestamp,
                  s.server_name AS "serverName",
                  ism.reachable,
                  ism.health,
                  ROUND(ism.inlet_temp_c, 2) AS "inletTempC",
                  ROUND(ism.cpu_temp_c, 2) AS "cpuTempC",
                  ROUND(ism.power_kw, 3) AS "powerKw",
                  ROUND(ism.memory_total_gb, 2) AS "memoryTotalGb",
                  ism.processor_count AS "processorCount"
                FROM ilo_server_metrics ism
                JOIN ilo_servers s ON s.id = ism.ilo_server_id
                WHERE ism.ts BETWEEN $1 AND $2${hostJoinFilter}
                ORDER BY ism.ts ${sortDirection}, s.server_name ASC
                LIMIT $${limitParam} OFFSET $${offsetParam}
            `,
        },
    };

    const definition = definitions[section];
    if (!definition) {
        throw new Error(`Unsupported section: ${section}`);
    }

    const [countResult, dataResult] = await Promise.all([
        pool.query(definition.countSql, Number.isFinite(hostId) ? [start, end, hostId] : [start, end]),
        pool.query(definition.dataSql, queryParams),
    ]);

    return {
        section,
        title: definition.title,
        range: filters.range || '1h',
        sort: sortDirection.toLowerCase(),
        page,
        pageSize,
        total: Number(countResult.rows[0]?.total || 0),
        columns: definition.columns,
        rows: dataResult.rows.map((row) => ({
            ...row,
            timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : row.timestamp,
        })),
    };
}

async function getRecentPowerHistory() {
    if (!pool) return [];
    try {
        const res = await pool.query(`
            WITH recent_points AS (
                SELECT DISTINCT ts
                FROM host_metrics
                ORDER BY ts DESC
                LIMIT 24
            )
            SELECT
                rp.ts,
                COALESCE(ROUND(SUM(hm.power_kw), 3), 0) AS total_power_kw
            FROM recent_points rp
            LEFT JOIN host_metrics hm ON hm.ts = rp.ts
            GROUP BY rp.ts
            ORDER BY rp.ts ASC
        `);
        return res.rows.map(row => ({
            t: new Date(row.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            v: Number(row.total_power_kw || 0)
        }));
    } catch (e) {
        console.error('[DB] getRecentPowerHistory failed:', e.message);
        return [];
    }
}

module.exports = {
    TWO_MINUTES_MS,
    initDb,
    isDbConfigured,
    storeSnapshot,
    getSuperAdminBundle,
    getSuperAdminDashboardData,
    getSuperAdminSectionDetails,
    getRecentPowerHistory,
};
