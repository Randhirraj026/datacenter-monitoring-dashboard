const { Pool } = require('pg');
require('dotenv').config({ path: 'backend/.env' });

const pool = new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD || '',
    database: process.env.PGDATABASE,
});

async function check() {
    try {
        const alerts = await pool.query('SELECT * FROM alert_snapshots ORDER BY ts DESC LIMIT 5');
        const vms = await pool.query('SELECT * FROM vm_events ORDER BY ts DESC LIMIT 5');
        console.log('--- Alert Snapshots ---');
        console.table(alerts.rows);
        console.log('--- VM Events ---');
        console.table(vms.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

check();
