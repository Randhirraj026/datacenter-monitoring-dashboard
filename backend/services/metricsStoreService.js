const { fetchAllILO } = require('./iloService');
const { fetchRduSummary } = require('./rduService');
const { getAlerts, getDatastores, getHosts, getNetworks, getVMs } = require('./vsphereService');
const { FIVE_MINUTES_MS, getLatestSnapshotAt, isDbConfigured, storeSnapshot } = require('../db');
const { processSnapshot } = require('./alertEngine');
const { getPreviousSnapshotState } = require('../db/alertSettings');

let timer = null;
let runInFlight = null;

async function collectAndStoreSnapshot() {
    if (runInFlight) return runInFlight;

    runInFlight = (async () => {
    if (!isDbConfigured()) return false;

    const [hostsData, vmsData, datastoresData, iloPayload, alertsData, networksData, rduPayload] = await Promise.all([
        getHosts({ forceRefresh: true }),
        getVMs(),
        getDatastores(),
        fetchAllILO(),
        getAlerts(),
        getNetworks(),
        fetchRduSummary({ includeRaw: true, forceRefresh: true }),
    ]);

    const hosts = hostsData?.hosts || [];
    const vms = Array.isArray(vmsData?.list) && !vmsData?.error ? vmsData.list : null;
    const datastores = datastoresData?.datastores || [];
    const alerts = alertsData?.alerts || [];
    const networks = networksData?.networks || [];

    if (!hosts.length && !Array.isArray(vms) && !datastores.length && !rduPayload) {
        console.warn('[DB] Snapshot skipped because all source collections are empty');
        return false;
    }

    const previousState = await getPreviousSnapshotState();
    const storeResult = await storeSnapshot({ hosts, vms, datastores, iloPayload, alerts, networks, rduPayload });
    await processSnapshot({ hosts, vms, datastores, iloPayload, alerts, networks, rduPayload, previousState, vmChanges: storeResult?.vmChanges || {} });
    console.log(
        `[DB] Snapshot stored: hosts=${hosts.length}, vms=${Array.isArray(vms) ? vms.length : 'unavailable'}, datastores=${datastores.length}, alerts=${alerts.length}, networks=${networks.length}, rdu=${rduPayload?.ok ? 'ok' : 'captured'}`
    );
    return true;
    })();

    try {
        return await runInFlight;
    } finally {
        runInFlight = null;
    }
}

async function ensureFreshSnapshot(maxAgeMs = Number(process.env.SUPERADMIN_SNAPSHOT_MAX_AGE_MS || FIVE_MINUTES_MS)) {
    if (!isDbConfigured()) return false;

    const latestSnapshotAt = await getLatestSnapshotAt();
    if (!latestSnapshotAt) {
        return collectAndStoreSnapshot();
    }

    const ageMs = Date.now() - new Date(latestSnapshotAt).getTime();
    if (ageMs > maxAgeMs) {
        return collectAndStoreSnapshot();
    }

    return false;
}

function startMetricsCollector() {
    if (!isDbConfigured() || timer) return;

    collectAndStoreSnapshot().catch((error) => {
        console.error('[DB] Initial snapshot failed:', error.message);
    });

    timer = setInterval(() => {
        collectAndStoreSnapshot().catch((error) => {
            console.error('[DB] Scheduled snapshot failed:', error.message);
        });
    }, FIVE_MINUTES_MS);
}

module.exports = {
    collectAndStoreSnapshot,
    ensureFreshSnapshot,
    startMetricsCollector,
};
