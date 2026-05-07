-- Superadmin read-only dashboard schema
-- Matches the tables used by backend/db/index.js

CREATE TABLE IF NOT EXISTS hosts (
  id BIGSERIAL PRIMARY KEY,
  host_name TEXT NOT NULL UNIQUE,
  total_cores INTEGER NOT NULL DEFAULT 0,
  total_memory_gb INTEGER NOT NULL DEFAULT 0,
  connection_state TEXT NOT NULL DEFAULT 'CONNECTED',
  power_state TEXT NOT NULL DEFAULT 'POWERED_ON',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS virtual_machines (
  id BIGSERIAL PRIMARY KEY,
  vm_name TEXT NOT NULL UNIQUE,
  host_id BIGINT REFERENCES hosts(id),
  status TEXT NOT NULL DEFAULT 'STOPPED',
  cpu_count INTEGER NOT NULL DEFAULT 0,
  memory_mib INTEGER NOT NULL DEFAULT 0,
  last_host_name TEXT,
  last_power_state TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_created_at TIMESTAMPTZ,
  source_deleted_at TIMESTAMPTZ,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS datastores (
  id BIGSERIAL PRIMARY KEY,
  datastore_name TEXT NOT NULL UNIQUE,
  datastore_type TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS host_metrics (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  host_id BIGINT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  cpu_usage_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  memory_usage_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  power_kw NUMERIC(10,3),
  temperature_c NUMERIC(5,2),
  status TEXT NOT NULL DEFAULT 'Normal'
);

CREATE TABLE IF NOT EXISTS datastore_metrics (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  datastore_id BIGINT NOT NULL REFERENCES datastores(id) ON DELETE CASCADE,
  total_capacity_gb NUMERIC(14,2) NOT NULL DEFAULT 0,
  used_space_gb NUMERIC(14,2) NOT NULL DEFAULT 0,
  free_space_gb NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Normal'
);

CREATE TABLE IF NOT EXISTS vm_events (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  vm_id BIGINT NOT NULL REFERENCES virtual_machines(id) ON DELETE CASCADE,
  host_id BIGINT REFERENCES hosts(id),
  vm_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alert_snapshots (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS networks (
  id BIGSERIAL PRIMARY KEY,
  network_name TEXT NOT NULL UNIQUE,
  network_type TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS network_snapshots (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  network_id BIGINT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'Active'
);

CREATE TABLE IF NOT EXISTS ilo_servers (
  id BIGSERIAL PRIMARY KEY,
  host_id BIGINT REFERENCES hosts(id) ON DELETE SET NULL,
  server_name TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  model TEXT,
  serial TEXT,
  bios TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ilo_server_metrics (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  ilo_server_id BIGINT NOT NULL REFERENCES ilo_servers(id) ON DELETE CASCADE,
  reachable BOOLEAN NOT NULL DEFAULT FALSE,
  health TEXT,
  inlet_temp_c NUMERIC(5,2),
  cpu_temp_c NUMERIC(5,2),
  power_kw NUMERIC(10,3),
  power_capacity_kw NUMERIC(10,3),
  memory_total_gb NUMERIC(10,2),
  processor_model TEXT,
  processor_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ilo_psu_metrics (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  ilo_server_id BIGINT NOT NULL REFERENCES ilo_servers(id) ON DELETE CASCADE,
  psu_name TEXT,
  status TEXT,
  state TEXT,
  input_watts NUMERIC(10,2)
);

CREATE TABLE IF NOT EXISTS ilo_fan_metrics (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  ilo_server_id BIGINT NOT NULL REFERENCES ilo_servers(id) ON DELETE CASCADE,
  fan_name TEXT,
  status TEXT,
  reading_value NUMERIC(10,2),
  reading_unit TEXT
);

CREATE TABLE IF NOT EXISTS ilo_storage_metrics (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  ilo_server_id BIGINT NOT NULL REFERENCES ilo_servers(id) ON DELETE CASCADE,
  controller_name TEXT,
  status TEXT,
  drive_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS rdu_snapshots (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  ok BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT,
  reason TEXT,
  rack_front_temp_c NUMERIC(6,2),
  rack_rear_temp_c NUMERIC(6,2),
  rack_front_humidity_pct NUMERIC(6,2),
  rack_rear_humidity_pct NUMERIC(6,2),
  humidity_pct NUMERIC(6,2),
  ac_supply_air_c NUMERIC(6,2),
  ac_return_air_c NUMERIC(6,2),
  power_cut_active BOOLEAN,
  ups_battery_pct NUMERIC(6,2),
  ups_battery_minutes_left NUMERIC(10,2),
  mains_status TEXT,
  rdu_status TEXT,
  active_alarm_count INTEGER NOT NULL DEFAULT 0,
  alerts JSONB NOT NULL DEFAULT '[]'::jsonb,
  sensors JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_payload JSONB
);

CREATE TABLE IF NOT EXISTS biometric_employees (
  employee_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS smtp_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  smtp_host TEXT NOT NULL DEFAULT '',
  smtp_port INTEGER NOT NULL DEFAULT 587,
  smtp_user TEXT NOT NULL DEFAULT '',
  smtp_password TEXT NOT NULL DEFAULT '',
  sender_email TEXT NOT NULL DEFAULT '',
  sender_name TEXT NOT NULL DEFAULT '',
  ssl_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  alert_recipient_emails TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  cc_emails TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  bcc_emails TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alert_rules (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  cpu_usage_threshold NUMERIC(5,2) NOT NULL DEFAULT 85,
  memory_usage_threshold NUMERIC(5,2) NOT NULL DEFAULT 85,
  disk_usage_threshold NUMERIC(5,2) NOT NULL DEFAULT 90,
  temperature_threshold NUMERIC(5,2) NOT NULL DEFAULT 35,
  power_failure_alert_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  vm_added_alert_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  vm_removed_alert_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  vm_power_alert_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  host_down_alert_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  rdu_alert_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  dashboard_parameter_change_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hosts_active_name
  ON hosts (is_active, host_name);

CREATE INDEX IF NOT EXISTS idx_virtual_machines_host_status
  ON virtual_machines (host_id, status);

CREATE INDEX IF NOT EXISTS idx_virtual_machines_deleted
  ON virtual_machines (is_deleted, vm_name);

CREATE INDEX IF NOT EXISTS idx_host_metrics_host_ts
  ON host_metrics (host_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_host_metrics_ts
  ON host_metrics (ts DESC);

CREATE INDEX IF NOT EXISTS idx_datastore_metrics_ds_ts
  ON datastore_metrics (datastore_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_datastore_metrics_ts
  ON datastore_metrics (ts DESC);

CREATE INDEX IF NOT EXISTS idx_vm_events_vm_ts
  ON vm_events (vm_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_vm_events_type_ts
  ON vm_events (event_type, ts DESC);

CREATE INDEX IF NOT EXISTS idx_alert_snapshots_ts
  ON alert_snapshots (ts DESC);

CREATE INDEX IF NOT EXISTS idx_network_snapshots_network_ts
  ON network_snapshots (network_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_ilo_server_metrics_server_ts
  ON ilo_server_metrics (ilo_server_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_ilo_psu_metrics_server_ts
  ON ilo_psu_metrics (ilo_server_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_ilo_fan_metrics_server_ts
  ON ilo_fan_metrics (ilo_server_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_ilo_storage_metrics_server_ts
  ON ilo_storage_metrics (ilo_server_id, ts DESC);

CREATE OR REPLACE VIEW latest_host_metrics AS
SELECT DISTINCT ON (hm.host_id)
  hm.id,
  hm.ts,
  hm.host_id,
  h.host_name,
  h.total_cores,
  h.total_memory_gb,
  hm.cpu_usage_pct,
  hm.memory_usage_pct,
  hm.power_kw,
  hm.temperature_c,
  hm.status
FROM host_metrics hm
JOIN hosts h ON h.id = hm.host_id
WHERE h.is_active = TRUE
ORDER BY hm.host_id, hm.ts DESC;

CREATE OR REPLACE VIEW latest_datastore_metrics AS
SELECT DISTINCT ON (dm.datastore_id)
  dm.id,
  dm.ts,
  dm.datastore_id,
  d.datastore_name,
  dm.total_capacity_gb,
  dm.used_space_gb,
  dm.free_space_gb,
  dm.status
FROM datastore_metrics dm
JOIN datastores d ON d.id = dm.datastore_id
WHERE d.is_active = TRUE
ORDER BY dm.datastore_id, dm.ts DESC;

CREATE OR REPLACE VIEW current_vm_inventory AS
SELECT
  vm.id,
  vm.vm_name,
  vm.host_id,
  h.host_name,
  vm.status,
  vm.first_seen_at,
  vm.last_seen_at
FROM virtual_machines vm
LEFT JOIN hosts h ON h.id = vm.host_id
WHERE vm.is_deleted = FALSE;
