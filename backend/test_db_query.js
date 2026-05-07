const { getRecentAlertSnapshots, initDb } = require('./db');
require('dotenv').config();

async function test() {
    try {
        await initDb();
        const alerts = await getRecentAlertSnapshots(20);
        console.log('--- Fetched Alerts ---');
        console.log(JSON.stringify(alerts, null, 2));
    } catch (e) {
        console.error('❌ Test failed:', e.message);
    } finally {
        process.exit();
    }
}

test();
