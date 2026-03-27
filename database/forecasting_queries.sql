-- Query to get historical data for CPU/Memory/Power/Temperature
SELECT 
    ts as timestamp,
    cpu_usage_pct as cpu,
    memory_usage_pct as memory,
    power_kw as power,
    temperature_c as temperature
FROM host_metrics
WHERE host_id = $1 AND ts >= NOW() - INTERVAL '30 days'
ORDER BY ts ASC;
