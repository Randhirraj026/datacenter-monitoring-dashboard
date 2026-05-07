const { Pool } = require('pg');
require('dotenv').config({ path: 'backend/.env' });

const pool = new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD || '',
    database: process.env.PGDATABASE,
});

async function run() {
    try {
        await pool.query(
            "INSERT INTO alert_snapshots (alert_type, severity, message, ts) VALUES ($1, $2, $3, now())",
            ['TEST_ALERT', 'Info', 'This is a test alert to verify notifications are working on both pages.']
        );
        console.log('✅ Injected test alert');
        
        await pool.query(
            "INSERT INTO vm_events (vm_id, host_id, vm_name, event_type, status, ts) VALUES ($1, $2, $3, $4, $5, now())",
            [1, 1, 'TestVM', 'POWERED_ON', 'RUNNING']
        );
        console.log('✅ Injected test VM event');
    } catch (e) {
        console.error('❌ Failed:', e.message);
    } finally {
        await pool.end();
    }
}

run();
