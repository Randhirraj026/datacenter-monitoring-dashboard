-- Superadmin dashboard queries
-- These are read-only queries for showing previously stored DB data.

-- 1. Latest host snapshot for the admin-style dashboard
SELECT
  host_id,
  host_name,
  total_cores,
  total_memory_gb,
  cpu_usage_pct,
  memory_usage_pct,
  power_kw,
  temperature_c,
  status,
  ts
FROM latest_host_metrics
ORDER BY host_name;

-- 2. Latest datastore snapshot
SELECT
  datastore_id,
  datastore_name,
  total_capacity_gb,
  used_space_gb,
  free_space_gb,
  ROUND((used_space_gb / NULLIF(total_capacity_gb, 0)) * 100, 2) AS used_pct,
  status,
  ts
FROM latest_datastore_metrics
ORDER BY datastore_name;

-- 3. Current VM inventory
SELECT
  id,
  vm_name,
  host_id,
  host_name,
  status,
  first_seen_at,
  last_seen_at
FROM current_vm_inventory
ORDER BY vm_name;

-- 4. Recent power history used by the power chart
WITH recent_points AS (
  SELECT DISTINCT ts
  FROM host_metrics
  ORDER BY ts DESC
  LIMIT 24
)
SELECT
  rp.ts,
  ROUND(COALESCE(SUM(hm.power_kw), 0), 3) AS total_power_kw
FROM recent_points rp
LEFT JOIN host_metrics hm ON hm.ts = rp.ts
GROUP BY rp.ts
ORDER BY rp.ts ASC;

-- 5. Recent VM activity history
SELECT
  ev.id,
  ev.ts,
  ev.vm_id,
  ev.vm_name,
  ev.host_id,
  h.host_name,
  ev.event_type,
  ev.status
FROM vm_events ev
LEFT JOIN hosts h ON h.id = ev.host_id
ORDER BY ev.ts DESC
LIMIT 100;

-- 6. Optional filtered host history for drill-down pages
SELECT
  hm.ts,
  hm.host_id,
  h.host_name,
  hm.cpu_usage_pct,
  hm.memory_usage_pct,
  hm.power_kw,
  hm.temperature_c,
  hm.status
FROM host_metrics hm
JOIN hosts h ON h.id = hm.host_id
WHERE ($1::bigint IS NULL OR hm.host_id = $1)
ORDER BY hm.ts DESC
LIMIT 200;

-- 7. Recent alerts captured from the admin page collectors
SELECT
  id,
  ts,
  alert_type,
  severity,
  message
FROM alert_snapshots
ORDER BY ts DESC
LIMIT 100;

-- 8. Latest network inventory snapshot
SELECT
  ns.ts,
  n.network_name,
  n.network_type,
  ns.status
FROM network_snapshots ns
JOIN networks n ON n.id = ns.network_id
ORDER BY ns.ts DESC, n.network_name ASC
LIMIT 200;

-- 9. Latest iLO server metrics and hardware details
SELECT
  ism.ts,
  s.server_name,
  s.ip_address,
  s.model,
  s.serial,
  s.bios,
  ism.reachable,
  ism.health,
  ism.inlet_temp_c,
  ism.cpu_temp_c,
  ism.power_kw,
  ism.power_capacity_kw,
  ism.memory_total_gb,
  ism.processor_model,
  ism.processor_count
FROM ilo_server_metrics ism
JOIN ilo_servers s ON s.id = ism.ilo_server_id
ORDER BY ism.ts DESC, s.server_name ASC
LIMIT 200;

-- 10. Recent PSU, fan, and storage-controller snapshots from iLO
SELECT
  pm.ts,
  s.server_name,
  pm.psu_name,
  pm.status,
  pm.state,
  pm.input_watts
FROM ilo_psu_metrics pm
JOIN ilo_servers s ON s.id = pm.ilo_server_id
ORDER BY pm.ts DESC, s.server_name ASC
LIMIT 200;

SELECT
  fm.ts,
  s.server_name,
  fm.fan_name,
  fm.status,
  fm.reading_value,
  fm.reading_unit
FROM ilo_fan_metrics fm
JOIN ilo_servers s ON s.id = fm.ilo_server_id
ORDER BY fm.ts DESC, s.server_name ASC
LIMIT 200;

SELECT
  sm.ts,
  s.server_name,
  sm.controller_name,
  sm.status,
  sm.drive_count
FROM ilo_storage_metrics sm
JOIN ilo_servers s ON s.id = sm.ilo_server_id
ORDER BY sm.ts DESC, s.server_name ASC
LIMIT 200;
