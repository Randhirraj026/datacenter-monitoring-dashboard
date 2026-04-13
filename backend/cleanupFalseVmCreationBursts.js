const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const { pool } = require('./db');

function parseArg(name, fallback) {
    const prefix = `--${name}=`;
    const arg = process.argv.find((item) => item.startsWith(prefix));
    if (!arg) return fallback;
    return arg.slice(prefix.length);
}

async function findBurstTimestamps(client, { hours, eventType, threshold, table, tsColumn, typeColumn }) {
    const result = await client.query(
        `
        SELECT ${tsColumn} AS ts, COUNT(*)::int AS count
        FROM ${table}
        WHERE ${typeColumn} = $1
          AND ${tsColumn} >= NOW() - ($2::int * INTERVAL '1 hour')
        GROUP BY ${tsColumn}
        HAVING COUNT(*) >= $3
        ORDER BY ${tsColumn} ASC
        `,
        [eventType, hours, threshold]
    );

    return result.rows;
}

async function main() {
    if (!pool) {
        throw new Error('Database is not configured');
    }

    const apply = process.argv.includes('--apply');
    const hours = Number(parseArg('hours', '24'));
    const vmThreshold = Number(parseArg('vm-threshold', '20'));
    const alertThreshold = Number(parseArg('alert-threshold', '20'));

    const client = await pool.connect();

    try {
        const vmBursts = await findBurstTimestamps(client, {
            hours,
            eventType: 'CREATED',
            threshold: vmThreshold,
            table: 'vm_events',
            tsColumn: 'ts',
            typeColumn: 'event_type',
        });

        const alertBursts = await findBurstTimestamps(client, {
            hours,
            eventType: 'VM_ADDED',
            threshold: alertThreshold,
            table: 'alert_snapshots',
            tsColumn: 'ts',
            typeColumn: 'alert_type',
        });

        const summary = {
            mode: apply ? 'apply' : 'dry-run',
            hours,
            vmThreshold,
            alertThreshold,
            vmBursts,
            alertBursts,
        };

        if (!apply) {
            console.log(JSON.stringify(summary, null, 2));
            return;
        }

        await client.query('BEGIN');

        let deletedVmEvents = 0;
        for (const burst of vmBursts) {
            const result = await client.query(
                `
                DELETE FROM vm_events
                WHERE event_type = 'CREATED'
                  AND ts = $1
                `,
                [burst.ts]
            );
            deletedVmEvents += result.rowCount || 0;
        }

        let deletedAlerts = 0;
        for (const burst of alertBursts) {
            const result = await client.query(
                `
                DELETE FROM alert_snapshots
                WHERE alert_type = 'VM_ADDED'
                  AND ts = $1
                `,
                [burst.ts]
            );
            deletedAlerts += result.rowCount || 0;
        }

        await client.query('COMMIT');

        console.log(JSON.stringify({
            ...summary,
            deletedVmEvents,
            deletedAlerts,
        }, null, 2));
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch (_rollbackError) {
            // Ignore rollback follow-up errors.
        }

        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
