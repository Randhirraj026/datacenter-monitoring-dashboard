const fs = require('fs/promises');
const path = require('path');

const { pool, isDbConfigured } = require('../db');
const { ARCHIVE_TABLES } = require('../config/archiveTables');
const { writeRowsToCsv, readCsvAsJson } = require('../utils/csvArchiveUtil');

const ARCHIVE_RETENTION_HOURS = Number(process.env.ARCHIVE_RETENTION_HOURS || (Number(process.env.ARCHIVE_RETENTION_DAYS || 7) * 24));
const ARCHIVE_RETENTION_MS = ARCHIVE_RETENTION_HOURS * 60 * 60 * 1000;
const ARCHIVE_BASE_DIR = path.resolve(
    __dirname,
    '..',
    '..',
    process.env.ARCHIVE_BASE_DIR || 'archives'
);

function formatFolderStamp(date) {
    const iso = date.toISOString();
    if (ARCHIVE_RETENTION_HOURS < 24) {
        return iso.slice(0, 16).replace(':', '-');
    }

    return iso.slice(0, 10);
}

function sanitizePathSegment(value) {
    return String(value || '').replace(/[^a-zA-Z0-9._-]/g, '');
}

function findTimestampColumn(columns = []) {
    const preferredColumns = ['ts', 'timestamp', 'created_at', 'updated_at', 'date'];
    return preferredColumns.find((column) => columns.includes(column)) || null;
}

function isWithinRange(dateValue, customFrom, customTo) {
    const rowTime = new Date(dateValue).getTime();
    if (Number.isNaN(rowTime)) return false;

    if (customFrom) {
        const fromTime = new Date(customFrom).getTime();
        if (!Number.isNaN(fromTime) && rowTime < fromTime) return false;
    }

    if (customTo) {
        const toTime = new Date(customTo).getTime();
        if (!Number.isNaN(toTime) && rowTime > toTime) return false;
    }

    return true;
}

function filterRowsByDateRange(rows, timestampColumn, customFrom, customTo) {
    if (!timestampColumn || (!customFrom && !customTo)) {
        return rows;
    }

    return rows.filter((row) => isWithinRange(row[timestampColumn], customFrom, customTo));
}

function buildFallbackFolderName(referenceDate = new Date()) {
    const windowEnd = new Date(referenceDate);
    const windowStart = new Date(referenceDate.getTime() - ARCHIVE_RETENTION_MS);
    return `${formatFolderStamp(windowStart)}_to_${formatFolderStamp(windowEnd)}`;
}

async function ensureArchiveBaseDir() {
    await fs.mkdir(ARCHIVE_BASE_DIR, { recursive: true });
}

async function getExistingTables(client) {
    const result = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
    `);

    return new Set(result.rows.map((row) => row.table_name));
}

function pickArchiveTables(existingTables) {
    return ARCHIVE_TABLES.filter((config) => existingTables.has(config.tableName));
}

async function fetchRowsForArchive(client, tableConfig, cutoffDate) {
    const query = `
        SELECT *
        FROM ${tableConfig.tableName}
        WHERE ${tableConfig.timestampColumn} < $1
        ORDER BY ${tableConfig.orderBy}
    `;

    const result = await client.query(query, [cutoffDate]);
    return result.rows;
}

async function deleteArchivedRows(client, tableConfig, cutoffDate) {
    const query = `
        DELETE FROM ${tableConfig.tableName}
        WHERE ${tableConfig.timestampColumn} < $1
    `;

    const result = await client.query(query, [cutoffDate]);
    return result.rowCount || 0;
}

function resolveArchiveWindow(exportedTables, fallbackDate) {
    const timestamps = exportedTables.flatMap((table) =>
        table.rows
            .map((row) => row[table.timestampColumn])
            .filter(Boolean)
            .map((value) => new Date(value))
            .filter((date) => !Number.isNaN(date.getTime()))
    );

    if (!timestamps.length) {
        return buildFallbackFolderName(fallbackDate);
    }

    const minDate = new Date(Math.min(...timestamps.map((item) => item.getTime())));
    const maxDate = new Date(Math.max(...timestamps.map((item) => item.getTime())));
    return `${formatFolderStamp(minDate)}_to_${formatFolderStamp(maxDate)}`;
}

async function cleanupArchiveFolder(folderPath) {
    try {
        await fs.rm(folderPath, { recursive: true, force: true });
    } catch (error) {
        console.error('[Archive] Failed to clean partial archive folder:', error.message);
    }
}

async function runWeeklyArchiveJob({ referenceDate = new Date() } = {}) {
    if (!isDbConfigured() || !pool) {
        throw new Error('Database is not configured');
    }

    const client = await pool.connect();
    let archiveFolderPath = null;

    try {
        const cutoffDate = new Date(referenceDate.getTime() - ARCHIVE_RETENTION_MS);
        const existingTables = await getExistingTables(client);
        const tablesToArchive = pickArchiveTables(existingTables);

        if (!tablesToArchive.length) {
            return {
                archived: false,
                reason: 'No configured archive tables found',
                folder: null,
                tables: [],
            };
        }

        await client.query('BEGIN');
        await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');

        const exportedTables = [];

        for (const tableConfig of tablesToArchive) {
            const rows = await fetchRowsForArchive(client, tableConfig, cutoffDate);
            exportedTables.push({ ...tableConfig, rows });
        }

        const tablesWithRows = exportedTables.filter((table) => table.rows.length > 0);
        if (!tablesWithRows.length) {
            await client.query('ROLLBACK');
            return {
                archived: false,
                reason: 'No rows matched the archive retention window',
                folder: null,
                tables: exportedTables.map((table) => ({
                    tableName: table.tableName,
                    fileName: table.fileName,
                    exportedRows: 0,
                    deletedRows: 0,
                })),
            };
        }

        await ensureArchiveBaseDir();

        const folderName = resolveArchiveWindow(tablesWithRows, referenceDate);
        archiveFolderPath = path.join(ARCHIVE_BASE_DIR, folderName);
        await fs.mkdir(archiveFolderPath, { recursive: true });

        for (const table of tablesWithRows) {
            const filePath = path.join(archiveFolderPath, `${table.fileName}.csv`);
            await writeRowsToCsv(filePath, table.rows);
        }

        const tableResults = [];
        for (const table of exportedTables) {
            const deletedRows = table.rows.length > 0
                ? await deleteArchivedRows(client, table, cutoffDate)
                : 0;

            tableResults.push({
                tableName: table.tableName,
                fileName: table.fileName,
                exportedRows: table.rows.length,
                deletedRows,
            });
        }

        await client.query('COMMIT');

        console.log(
            `[Archive] Weekly archive completed: folder=${folderName}, tables=${tableResults.length}`
        );

        return {
            archived: true,
            folder: folderName,
            folderPath: archiveFolderPath,
            retentionHours: ARCHIVE_RETENTION_HOURS,
            cutoffDate: cutoffDate.toISOString(),
            tables: tableResults,
        };
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch (_rollbackError) {
            // Ignore rollback follow-up failures and preserve the original error.
        }

        if (archiveFolderPath) {
            await cleanupArchiveFolder(archiveFolderPath);
        }

        console.error('[Archive] Weekly archive failed:', error.message);
        throw error;
    } finally {
        client.release();
    }
}

async function listArchiveFolders() {
    await ensureArchiveBaseDir();

    const entries = await fs.readdir(ARCHIVE_BASE_DIR, { withFileTypes: true });
    const folders = [];

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const folderPath = path.join(ARCHIVE_BASE_DIR, entry.name);
        const files = await fs.readdir(folderPath, { withFileTypes: true });
        const tables = files
            .filter((file) => file.isFile() && file.name.endsWith('.csv'))
            .map((file) => path.basename(file.name, '.csv'))
            .sort((left, right) => left.localeCompare(right));

        folders.push({
            folder: entry.name,
            tables,
        });
    }

    return folders.sort((left, right) => right.folder.localeCompare(left.folder));
}

async function getArchiveTableData(folderName, tableName, filters = {}) {
    await ensureArchiveBaseDir();

    const safeFolder = sanitizePathSegment(folderName);
    const safeTable = sanitizePathSegment(tableName);

    if (!safeFolder || !safeTable) {
        throw new Error('Invalid archive path');
    }

    const filePath = path.join(ARCHIVE_BASE_DIR, safeFolder, `${safeTable}.csv`);
    const rows = await readCsvAsJson(filePath);
    const columns = rows.length ? Object.keys(rows[0]) : [];
    const timestampColumn = findTimestampColumn(columns);
    const filteredRows = filterRowsByDateRange(
        rows,
        timestampColumn,
        filters.customFrom,
        filters.customTo
    );

    return {
        folder: safeFolder,
        table: safeTable,
        columns,
        timestampColumn,
        appliedFilters: {
            customFrom: filters.customFrom || null,
            customTo: filters.customTo || null,
        },
        totalRows: rows.length,
        filteredRows: filteredRows.length,
        rows: filteredRows,
    };
}

function parseArchiveWindow(folderName) {
    const match = String(folderName || '').match(/^([0-9T:-]{10,16})_to_([0-9T:-]{10,16})$/);
    if (!match) return null;

    const normalizeStamp = (value, isEnd) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return `${value}${isEnd ? 'T23:59:59.999Z' : 'T00:00:00.000Z'}`;
        }

        if (/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}$/.test(value)) {
            const normalized = value.replace(/^(.{13})-(\d{2})$/, '$1:$2');
            return `${normalized}${isEnd ? ':59.999Z' : ':00.000Z'}`;
        }

        return value;
    };

    return {
        start: new Date(normalizeStamp(match[1], false)),
        end: new Date(normalizeStamp(match[2], true)),
    };
}

function windowsOverlap(leftStart, leftEnd, rightStart, rightEnd) {
    return leftStart <= rightEnd && rightStart <= leftEnd;
}

async function getArchiveFoldersForRange(customFrom, customTo) {
    const folders = await listArchiveFolders();
    const rangeStart = new Date(customFrom);
    const rangeEnd = new Date(customTo);

    return folders.filter((folder) => {
        const parsed = parseArchiveWindow(folder.folder);
        if (!parsed) return false;
        return windowsOverlap(parsed.start, parsed.end, rangeStart, rangeEnd);
    });
}

async function buildReferenceMaps() {
    const [hostsResult, datastoresResult, networksResult, iloServersResult] = await Promise.all([
        pool.query('SELECT id, host_name FROM hosts'),
        pool.query('SELECT id, datastore_name FROM datastores'),
        pool.query('SELECT id, network_name, network_type FROM networks'),
        pool.query('SELECT id, server_name FROM ilo_servers'),
    ]);

    return {
        hosts: new Map(hostsResult.rows.map((row) => [String(row.id), row.host_name])),
        datastores: new Map(datastoresResult.rows.map((row) => [String(row.id), row.datastore_name])),
        networks: new Map(networksResult.rows.map((row) => [String(row.id), { name: row.network_name, type: row.network_type }])),
        iloServers: new Map(iloServersResult.rows.map((row) => [String(row.id), row.server_name])),
    };
}

function getArchivedSectionDefinition(section, referenceMaps) {
    const baseDefinitions = {
        cpu: {
            fileName: 'host_metrics',
            title: 'CPU Records',
            timestampKey: 'ts',
            columns: [
                { key: 'timestamp', label: 'Timestamp' },
                { key: 'hostName', label: 'Host' },
                { key: 'cpuUsagePct', label: 'CPU Usage %' },
                { key: 'status', label: 'Status' },
            ],
            mapRow: (row) => ({
                timestamp: row.ts,
                hostId: row.host_id,
                hostName: referenceMaps.hosts.get(String(row.host_id)) || `Host ${row.host_id}`,
                cpuUsagePct: row.cpu_usage_pct != null ? Number(row.cpu_usage_pct) : null,
                status: row.status || 'Normal',
            }),
            filterRow: (_row, mappedRow, hostId) => !hostId || String(mappedRow.hostId) === String(hostId),
        },
        memory: {
            fileName: 'host_metrics',
            title: 'Memory Records',
            timestampKey: 'ts',
            columns: [
                { key: 'timestamp', label: 'Timestamp' },
                { key: 'hostName', label: 'Host' },
                { key: 'memoryUsagePct', label: 'Memory Usage %' },
                { key: 'status', label: 'Status' },
            ],
            mapRow: (row) => ({
                timestamp: row.ts,
                hostId: row.host_id,
                hostName: referenceMaps.hosts.get(String(row.host_id)) || `Host ${row.host_id}`,
                memoryUsagePct: row.memory_usage_pct != null ? Number(row.memory_usage_pct) : null,
                status: row.status || 'Normal',
            }),
            filterRow: (_row, mappedRow, hostId) => !hostId || String(mappedRow.hostId) === String(hostId),
        },
        storage: {
            fileName: 'datastore_metrics',
            title: 'Storage Records',
            timestampKey: 'ts',
            columns: [
                { key: 'timestamp', label: 'Timestamp' },
                { key: 'datastoreName', label: 'Datastore' },
                { key: 'totalCapacityGb', label: 'Total GB' },
                { key: 'usedSpaceGb', label: 'Used GB' },
                { key: 'freeSpaceGb', label: 'Free GB' },
                { key: 'usedPct', label: 'Usage %' },
                { key: 'status', label: 'Status' },
            ],
            mapRow: (row) => {
                const total = Number(row.total_capacity_gb || 0);
                const used = Number(row.used_space_gb || 0);
                return {
                    timestamp: row.ts,
                    datastoreId: row.datastore_id,
                    datastoreName: referenceMaps.datastores.get(String(row.datastore_id)) || `Datastore ${row.datastore_id}`,
                    totalCapacityGb: total,
                    usedSpaceGb: used,
                    freeSpaceGb: Number(row.free_space_gb || 0),
                    usedPct: total > 0 ? Number(((used / total) * 100).toFixed(2)) : 0,
                    status: row.status || 'Normal',
                };
            },
            filterRow: () => true,
        },
        power: {
            fileName: 'host_metrics',
            title: 'Power Records',
            timestampKey: 'ts',
            columns: [
                { key: 'timestamp', label: 'Timestamp' },
                { key: 'hostName', label: 'Host' },
                { key: 'powerKw', label: 'Power kW' },
                { key: 'status', label: 'Status' },
            ],
            mapRow: (row) => ({
                timestamp: row.ts,
                hostId: row.host_id,
                hostName: referenceMaps.hosts.get(String(row.host_id)) || `Host ${row.host_id}`,
                powerKw: row.power_kw != null ? Number(row.power_kw) : null,
                status: row.status || 'Normal',
            }),
            filterRow: (_row, mappedRow, hostId) => mappedRow.powerKw != null && (!hostId || String(mappedRow.hostId) === String(hostId)),
        },
        temperature: {
            fileName: 'host_metrics',
            title: 'Temperature Records',
            timestampKey: 'ts',
            columns: [
                { key: 'timestamp', label: 'Timestamp' },
                { key: 'hostName', label: 'Host' },
                { key: 'temperatureC', label: 'Temperature C' },
                { key: 'status', label: 'Status' },
            ],
            mapRow: (row) => ({
                timestamp: row.ts,
                hostId: row.host_id,
                hostName: referenceMaps.hosts.get(String(row.host_id)) || `Host ${row.host_id}`,
                temperatureC: row.temperature_c != null ? Number(row.temperature_c) : null,
                status: row.status || 'Normal',
            }),
            filterRow: (_row, mappedRow, hostId) => mappedRow.temperatureC != null && (!hostId || String(mappedRow.hostId) === String(hostId)),
        },
        vm: {
            fileName: 'vm_events',
            title: 'VM Activity Records',
            timestampKey: 'ts',
            columns: [
                { key: 'timestamp', label: 'Timestamp' },
                { key: 'vmName', label: 'VM' },
                { key: 'hostName', label: 'Host' },
                { key: 'eventType', label: 'Event' },
                { key: 'status', label: 'Status' },
            ],
            mapRow: (row) => ({
                timestamp: row.ts,
                hostId: row.host_id,
                vmName: row.vm_name,
                hostName: row.host_id ? (referenceMaps.hosts.get(String(row.host_id)) || `Host ${row.host_id}`) : '-',
                eventType: row.event_type,
                status: row.status,
            }),
            filterRow: (_row, mappedRow, hostId) => !hostId || String(mappedRow.hostId) === String(hostId),
        },
        alerts: {
            fileName: 'alerts',
            title: 'Alert Records',
            timestampKey: 'ts',
            columns: [
                { key: 'timestamp', label: 'Timestamp' },
                { key: 'alertType', label: 'Type' },
                { key: 'severity', label: 'Severity' },
                { key: 'message', label: 'Message' },
            ],
            mapRow: (row) => ({
                timestamp: row.ts,
                alertType: row.alert_type,
                severity: row.severity,
                message: row.message,
            }),
            filterRow: () => true,
        },
        network: {
            fileName: 'network_metrics',
            title: 'Network Records',
            timestampKey: 'ts',
            columns: [
                { key: 'timestamp', label: 'Timestamp' },
                { key: 'networkName', label: 'Network' },
                { key: 'networkType', label: 'Type' },
                { key: 'status', label: 'Status' },
            ],
            mapRow: (row) => {
                const network = referenceMaps.networks.get(String(row.network_id)) || {};
                return {
                    timestamp: row.ts,
                    networkName: network.name || `Network ${row.network_id}`,
                    networkType: network.type || '-',
                    status: row.status || 'Active',
                };
            },
            filterRow: () => true,
        },
        ilo: {
            fileName: 'ilo_server_metrics',
            title: 'iLO Hardware Records',
            timestampKey: 'ts',
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
            mapRow: (row) => ({
                timestamp: row.ts,
                iloServerId: row.ilo_server_id,
                serverName: referenceMaps.iloServers.get(String(row.ilo_server_id)) || `Server ${row.ilo_server_id}`,
                reachable: Boolean(row.reachable),
                health: row.health || 'Unknown',
                inletTempC: row.inlet_temp_c != null ? Number(row.inlet_temp_c) : null,
                cpuTempC: row.cpu_temp_c != null ? Number(row.cpu_temp_c) : null,
                powerKw: row.power_kw != null ? Number(row.power_kw) : null,
                memoryTotalGb: row.memory_total_gb != null ? Number(row.memory_total_gb) : null,
                processorCount: row.processor_count != null ? Number(row.processor_count) : 0,
            }),
            filterRow: () => true,
        },
        rdu: {
            fileName: 'rdu_snapshots',
            title: 'Vertiv RDU Records',
            timestampKey: 'ts',
            columns: [
                { key: 'timestamp', label: 'Timestamp' },
                { key: 'ok', label: 'Connected' },
                { key: 'rackFrontTempC', label: 'Front Temp C' },
                { key: 'rackRearTempC', label: 'Rear Temp C' },
                { key: 'humidityPct', label: 'Humidity %' },
                { key: 'upsBatteryPct', label: 'Battery %' },
                { key: 'upsBatteryMinutesLeft', label: 'Battery Min' },
                { key: 'mainsStatus', label: 'Mains Status' },
                { key: 'rduStatus', label: 'RDU Status' },
                { key: 'activeAlarmCount', label: 'Alarm Count' },
                { key: 'reason', label: 'Reason' },
            ],
            mapRow: (row) => ({
                timestamp: row.ts,
                ok: Boolean(row.ok),
                rackFrontTempC: row.rack_front_temp_c != null ? Number(row.rack_front_temp_c) : null,
                rackRearTempC: row.rack_rear_temp_c != null ? Number(row.rack_rear_temp_c) : null,
                humidityPct: row.humidity_pct != null ? Number(row.humidity_pct) : null,
                upsBatteryPct: row.ups_battery_pct != null ? Number(row.ups_battery_pct) : null,
                upsBatteryMinutesLeft: row.ups_battery_minutes_left != null ? Number(row.ups_battery_minutes_left) : null,
                mainsStatus: row.mains_status || null,
                rduStatus: row.rdu_status || null,
                activeAlarmCount: Number(row.active_alarm_count || 0),
                reason: row.reason || null,
            }),
            filterRow: () => true,
        },
    };

    return baseDefinitions[section] || null;
}

async function getArchivedSectionDetails(filters = {}) {
    const section = String(filters.section || '').toLowerCase();
    const definition = getArchivedSectionDefinition(section, await buildReferenceMaps());
    if (!definition) {
        throw new Error(`Unsupported archived section: ${section}`);
    }

    const folders = await getArchiveFoldersForRange(filters.customFrom, filters.customTo);
    const rows = [];

    for (const folder of folders) {
        if (!folder.tables.includes(definition.fileName)) continue;

        const data = await getArchiveTableData(folder.folder, definition.fileName, {
            customFrom: filters.customFrom,
            customTo: filters.customTo,
        });

        for (const row of data.rows) {
            const mappedRow = definition.mapRow(row);
            if (definition.filterRow(row, mappedRow, filters.hostId)) {
                rows.push(mappedRow);
            }
        }
    }

    const sortDirection = String(filters.sort || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const page = Number(filters.page || 1);
    const pageSize = Math.min(Number(filters.pageSize || 50), 500);

    const sortedRows = rows.sort((left, right) => {
        const leftTime = new Date(left.timestamp || 0).getTime();
        const rightTime = new Date(right.timestamp || 0).getTime();
        return sortDirection === 'asc' ? leftTime - rightTime : rightTime - leftTime;
    });

    const start = (page - 1) * pageSize;
    const pagedRows = sortedRows.slice(start, start + pageSize);

    return {
        section,
        title: definition.title,
        range: filters.range || 'custom',
        sort: sortDirection,
        page,
        pageSize,
        total: sortedRows.length,
        columns: definition.columns,
        rows: pagedRows,
        source: 'archive',
    };
}

async function getArchivedBundle(filters = {}) {
    const vmDetails = await getArchivedSectionDetails({
        ...filters,
        section: 'vm',
        page: 1,
        pageSize: 5000,
        sort: 'asc',
    });

    const grouped = new Map();
    vmDetails.rows.forEach((row) => {
        const dateKey = String(row.timestamp || '').slice(0, 10);
        if (!dateKey) return;

        const current = grouped.get(dateKey) || {
            statDate: dateKey,
            createdCount: 0,
            deletedCount: 0,
            runningCount: 0,
            stoppedCount: 0,
        };

        if (row.eventType === 'CREATED') current.createdCount += 1;
        if (row.eventType === 'DELETED') current.deletedCount += 1;
        if (String(row.status || '').toLowerCase() === 'running') current.runningCount += 1;
        if (String(row.status || '').toLowerCase() === 'stopped') current.stoppedCount += 1;

        grouped.set(dateKey, current);
    });

    return {
        charts: {
            vmLifecycle: Array.from(grouped.values()).sort((left, right) => left.statDate.localeCompare(right.statDate)),
        },
        tables: {
            vmActivity: vmDetails.rows.map((row) => ({
                ts: row.timestamp,
                vmName: row.vmName,
                hostName: row.hostName,
                eventType: row.eventType,
                status: row.status,
            })),
        },
        source: 'archive',
    };
}

function getArchiveWindowMode(filters = {}) {
    if (!filters.customFrom || !filters.customTo) {
        return 'none';
    }

    const customFrom = new Date(filters.customFrom);
    const customTo = new Date(filters.customTo);
    if (Number.isNaN(customFrom.getTime()) || Number.isNaN(customTo.getTime())) {
        return 'none';
    }

    const cutoffDate = new Date(Date.now() - ARCHIVE_RETENTION_MS);
    if (customTo < cutoffDate) return 'archive_only';
    if (customFrom < cutoffDate && customTo >= cutoffDate) return 'hybrid';
    return 'none';
}

function isArchivedWindow(filters = {}) {
    return getArchiveWindowMode(filters) === 'archive_only';
}

module.exports = {
    ARCHIVE_BASE_DIR,
    ARCHIVE_RETENTION_HOURS,
    ARCHIVE_RETENTION_MS,
    runWeeklyArchiveJob,
    listArchiveFolders,
    getArchiveTableData,
    getArchivedSectionDetails,
    getArchivedBundle,
    getArchiveWindowMode,
    isArchivedWindow,
};
