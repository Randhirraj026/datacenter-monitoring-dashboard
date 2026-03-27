const { fetchAllILO } = require('./iloService');
const { getAlerts, getDatastores, getHosts, getNetworks, getVMs } = require('./vsphereService');
const { TWO_MINUTES_MS, isDbConfigured, storeSnapshot } = require('../db');

let timer = null;

async function collectAndStoreSnapshot() {
    if (!isDbConfigured()) return false;

    const [hostsData, vmsData, datastoresData, iloPayload, alertsData, networksData] = await Promise.all([
        getHosts(),
        getVMs(),
        getDatastores(),
        fetchAllILO(),
        getAlerts(),
        getNetworks(),
    ]);

    const hosts = hostsData?.hosts || [];
    const vms = vmsData?.list || [];
    const datastores = datastoresData?.datastores || [];
    const alerts = alertsData?.alerts || [];
    const networks = networksData?.networks || [];

    if (!hosts.length && !vms.length && !datastores.length) {
        console.warn('[DB] Snapshot skipped because all source collections are empty');
        return false;
    }

    await storeSnapshot({ hosts, vms, datastores, iloPayload, alerts, networks });
    console.log(`[DB] Snapshot stored: hosts=${hosts.length}, vms=${vms.length}, datastores=${datastores.length}, alerts=${alerts.length}, networks=${networks.length}`);
    return true;
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
    }, TWO_MINUTES_MS);
}

module.exports = {
    collectAndStoreSnapshot,
    startMetricsCollector,
};
