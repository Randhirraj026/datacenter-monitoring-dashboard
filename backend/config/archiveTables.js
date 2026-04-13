const ARCHIVE_TABLES = [
    {
        tableName: 'users',
        fileName: 'users',
        timestampColumn: 'created_at',
        orderBy: 'created_at ASC',
    },
    {
        tableName: 'host_metrics',
        fileName: 'host_metrics',
        timestampColumn: 'ts',
        orderBy: 'ts ASC, id ASC',
    },
    {
        tableName: 'datastore_metrics',
        fileName: 'datastore_metrics',
        timestampColumn: 'ts',
        orderBy: 'ts ASC, id ASC',
    },
    {
        tableName: 'vm_events',
        fileName: 'vm_events',
        timestampColumn: 'ts',
        orderBy: 'ts ASC, id ASC',
    },
    {
        tableName: 'alert_snapshots',
        fileName: 'alerts',
        timestampColumn: 'ts',
        orderBy: 'ts ASC, id ASC',
    },
    {
        tableName: 'network_snapshots',
        fileName: 'network_metrics',
        timestampColumn: 'ts',
        orderBy: 'ts ASC, id ASC',
    },
    {
        tableName: 'ilo_server_metrics',
        fileName: 'ilo_server_metrics',
        timestampColumn: 'ts',
        orderBy: 'ts ASC, id ASC',
    },
    {
        tableName: 'ilo_psu_metrics',
        fileName: 'ilo_psu_metrics',
        timestampColumn: 'ts',
        orderBy: 'ts ASC, id ASC',
    },
    {
        tableName: 'ilo_fan_metrics',
        fileName: 'ilo_fan_metrics',
        timestampColumn: 'ts',
        orderBy: 'ts ASC, id ASC',
    },
    {
        tableName: 'ilo_storage_metrics',
        fileName: 'ilo_storage_metrics',
        timestampColumn: 'ts',
        orderBy: 'ts ASC, id ASC',
    },
    {
        tableName: 'rdu_snapshots',
        fileName: 'rdu_snapshots',
        timestampColumn: 'ts',
        orderBy: 'ts ASC, id ASC',
    },
];

module.exports = {
    ARCHIVE_TABLES,
};
