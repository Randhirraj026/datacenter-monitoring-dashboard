require('dotenv').config();
const { initDb, getRecentPowerHistory } = require('./db/index.js');
async function run() {
    try {
        await initDb();
        const res = await getRecentPowerHistory();
        console.log('Result:', JSON.stringify(res));
    } catch(e) {
        console.error(e);
    }
    process.exit(0);
}
run();
