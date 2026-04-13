-- Weekly archive cleanup queries
-- These mirror the retention logic used by backend/services/archiveService.js.

DELETE FROM users
WHERE created_at < NOW() - INTERVAL '7 days';

DELETE FROM host_metrics
WHERE ts < NOW() - INTERVAL '7 days';

DELETE FROM datastore_metrics
WHERE ts < NOW() - INTERVAL '7 days';

DELETE FROM vm_events
WHERE ts < NOW() - INTERVAL '7 days';

DELETE FROM alert_snapshots
WHERE ts < NOW() - INTERVAL '7 days';

DELETE FROM network_snapshots
WHERE ts < NOW() - INTERVAL '7 days';

DELETE FROM ilo_server_metrics
WHERE ts < NOW() - INTERVAL '7 days';

DELETE FROM ilo_psu_metrics
WHERE ts < NOW() - INTERVAL '7 days';

DELETE FROM ilo_fan_metrics
WHERE ts < NOW() - INTERVAL '7 days';

DELETE FROM ilo_storage_metrics
WHERE ts < NOW() - INTERVAL '7 days';

DELETE FROM rdu_snapshots
WHERE ts < NOW() - INTERVAL '7 days';
