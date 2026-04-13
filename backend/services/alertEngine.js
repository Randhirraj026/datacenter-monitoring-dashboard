const { getAlertConfiguration, getPreviousSnapshotState } = require('../db/alertSettings');
const { storeGeneratedAlertEvents } = require('../db');
const { sendMail } = require('./mailService');
const { formatDashboardTimestamp } = require('./mailService');

const CHANGE_DELTA_THRESHOLD = 15;

function roundValue(value, digits = 2) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Number(numeric.toFixed(digits)) : 0;
}

function getDatastoreUsagePercent(datastore) {
    const total = Number(datastore?.capacityGB || 0);
    const used = Number(datastore?.usedSpaceGB || 0);
    return total > 0 ? roundValue((used / total) * 100) : 0;
}

function buildAlertEmail(event) {
    const severity = getSeverityLabel(event);
    const enrichedDetails = enrichAlertDetails(event.details || {});
    const lines = [
        `Severity: ${severity.label}`,
        `Alert Type: ${event.type}`,
        ...Object.entries(enrichedDetails).map(([key, value]) => `${key}: ${value}`),
    ];

    return {
        subject: event.subject,
        text: lines.join('\n'),
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.7; background: #f8fafc; padding: 24px;">
                <div style="max-width: 720px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 18px; overflow: hidden;">
                    <div style="padding: 18px 22px; background: ${severity.bannerBg}; border-bottom: 1px solid ${severity.border};">
                        <div style="display: inline-block; padding: 6px 10px; border-radius: 999px; background: ${severity.badgeBg}; color: ${severity.badgeText}; font-size: 12px; font-weight: 700; letter-spacing: 0.08em;">
                            ${severity.label}
                        </div>
                        <h2 style="margin: 12px 0 0; color: ${severity.heading}; font-size: 20px; line-height: 1.3;">${event.subject}</h2>
                    </div>
                    <div style="padding: 22px;">
                        ${Object.entries(enrichedDetails)
                            .map(([key, value]) => `
                                <div style="margin: 0 0 12px; padding: 12px 14px; border-radius: 12px; background: #f8fafc; border: 1px solid #e2e8f0;">
                                    <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 4px;">${key}</div>
                                    <div style="font-size: 16px; color: #0f172a; font-weight: 600;">${value}</div>
                                </div>
                            `)
                    .join('')}
                    </div>
                </div>
            </div>
        `,
    };
}

function formatVmMemory(memoryMib) {
    const mib = Number(memoryMib || 0);
    if (!Number.isFinite(mib) || mib <= 0) return 'Unknown';
    return `${roundValue(mib / 1024)} GB`;
}

function isHostDown(host) {
    return String(host?.connectionState || '').toUpperCase() !== 'CONNECTED'
        || String(host?.powerState || '').toUpperCase() !== 'POWERED_ON';
}

function normalizeRduAlerts(alerts = []) {
    return alerts
        .map((alert) => alert?.title || alert?.message || alert?.id || '')
        .filter(Boolean)
        .sort();
}

function getSeverityLabel(event) {
    const subject = String(event?.subject || '').toUpperCase();
    const type = String(event?.type || '').toUpperCase();

    if (subject.includes('CRITICAL') || subject.includes('POWER FAILURE') || type.includes('HOST_DOWN') || type.includes('POWER_FAILURE') || type.includes('RDU_ALERT')) {
        return {
            label: 'CRITICAL',
            bannerBg: '#fef2f2',
            badgeBg: '#b91c1c',
            badgeText: '#ffffff',
            heading: '#991b1b',
            border: '#fecaca',
        };
    }

    if (subject.includes('CHANGE') || type.includes('SPIKE') || type.includes('CHANGE')) {
        return {
            label: 'WARNING',
            bannerBg: '#fff7ed',
            badgeBg: '#c2410c',
            badgeText: '#ffffff',
            heading: '#9a3412',
            border: '#fed7aa',
        };
    }

    return {
        label: 'INFO',
        bannerBg: '#eff6ff',
        badgeBg: '#1d4ed8',
        badgeText: '#ffffff',
        heading: '#1e3a8a',
        border: '#bfdbfe',
    };
}

function inferHostGroup(value) {
    const text = String(value || '').toUpperCase();

    if (!text) return null;
    if (text.includes('10.10.10.150') || text.includes('10.10.10.76') || text.includes('RND') || text.includes('R & D')) return 'R & D';
    if (text.includes('10.10.10.65') || text.includes('10.10.10.75') || text.includes('GEN') || text.includes('GENERATIVE')) return 'GENERATIVE_AI';
    if (text.includes('10.10.10.2') || text.includes('10.10.10.71') || text.includes('PROTELION')) return 'PROTELION';
    if (text.includes('ORION')) return 'ORION';

    return null;
}

function enrichAlertDetails(details) {
    const enriched = { ...details };
    const hostValue = enriched['Host Name'] || enriched.Host || enriched['Host IP'] || '';
    const hostGroup = inferHostGroup(hostValue);

    if (hostGroup && !enriched['Host Group']) {
        enriched['Host Group'] = hostGroup;
    }

    return enriched;
}

function buildEvents({ currentSnapshot, previousState, rules }) {
    const events = [];
    const eventTime = new Date();
    const now = formatDashboardTimestamp(eventTime);
    const timestamp = eventTime.toISOString();

    const previousHosts = new Map((previousState?.hosts || []).map((host) => [host.name, host]));
    const previousDatastores = new Map((previousState?.datastores || []).map((datastore) => [datastore.name, datastore]));
    const previousVmMap = new Map((previousState?.vms || []).map((vm) => [vm.name, vm]));
    const previousVmNames = new Set((previousState?.vms || []).map((vm) => vm.name));
    const currentVmList = Array.isArray(currentSnapshot.vms) ? currentSnapshot.vms : null;
    const currentVmNames = new Set((currentVmList || []).map((vm) => vm.name));
    const addedCandidates = Array.isArray(currentSnapshot.vmChanges?.added)
        ? currentSnapshot.vmChanges.added
        : null;
    const deletedCandidates = Array.isArray(currentSnapshot.vmChanges?.deleted)
        ? currentSnapshot.vmChanges.deleted
        : null;
    const previousRdu = previousState?.rdu || null;
    const currentRdu = currentSnapshot.rduPayload || null;

    for (const host of currentSnapshot.hosts || []) {
        const previous = previousHosts.get(host.name);
        const currentTemperature = host.temperatureC != null ? Number(host.temperatureC) : null;

        if (Number(host.cpuUsagePercent || 0) > Number(rules.cpuUsageThreshold)
            && (!previous || Number(previous.cpuUsagePercent || 0) <= Number(rules.cpuUsageThreshold))) {
            events.push({
                type: 'CPU_THRESHOLD',
                subject: 'CRITICAL ALERT - CPU Usage High',
                details: {
                    'Host Name': host.name,
                    'Current CPU Usage': `${roundValue(host.cpuUsagePercent)}%`,
                    Threshold: `${roundValue(rules.cpuUsageThreshold)}%`,
                    Time: now,
                },
            });
        }

        if (Number(host.memoryUsagePercent || 0) > Number(rules.memoryUsageThreshold)
            && (!previous || Number(previous.memoryUsagePercent || 0) <= Number(rules.memoryUsageThreshold))) {
            events.push({
                type: 'MEMORY_THRESHOLD',
                subject: 'CRITICAL ALERT - Memory Usage High',
                details: {
                    'Host Name': host.name,
                    'Current Memory Usage': `${roundValue(host.memoryUsagePercent)}%`,
                    Threshold: `${roundValue(rules.memoryUsageThreshold)}%`,
                    Time: now,
                },
            });
        }

        if (currentTemperature != null
            && currentTemperature > Number(rules.temperatureThreshold)
            && (!previous || Number(previous.temperatureC || 0) <= Number(rules.temperatureThreshold))) {
            events.push({
                type: 'TEMPERATURE_THRESHOLD',
                subject: 'CRITICAL ALERT - Temperature Threshold Exceeded',
                details: {
                    'Host Name': host.name,
                    'Current Temperature': `${roundValue(currentTemperature)} C`,
                    Threshold: `${roundValue(rules.temperatureThreshold)} C`,
                    Time: now,
                },
            });
        }

        if (rules.hostDownAlertEnabled && isHostDown(host) && (!previous || !isHostDown(previous))) {
            events.push({
                type: 'HOST_DOWN',
                subject: 'HOST DOWN ALERT',
                details: {
                    'Host Name': host.name,
                    'Connection State': host.connectionState || 'Unknown',
                    'Power State': host.powerState || 'Unknown',
                    Time: now,
                },
            });
        }

        if (rules.dashboardParameterChangeEnabled && previous) {
            const cpuDelta = Math.abs(Number(host.cpuUsagePercent || 0) - Number(previous.cpuUsagePercent || 0));
            const memoryDelta = Math.abs(Number(host.memoryUsagePercent || 0) - Number(previous.memoryUsagePercent || 0));

            if (cpuDelta >= CHANGE_DELTA_THRESHOLD) {
                events.push({
                    type: 'CPU_SPIKE',
                    subject: 'PARAMETER CHANGE ALERT - CPU Spike Detected',
                    details: {
                        'Host Name': host.name,
                        'Previous CPU Usage': `${roundValue(previous.cpuUsagePercent)}%`,
                        'Current CPU Usage': `${roundValue(host.cpuUsagePercent)}%`,
                        Change: `${roundValue(cpuDelta)} percentage points`,
                        Time: now,
                    },
                });
            }

            if (memoryDelta >= CHANGE_DELTA_THRESHOLD) {
                events.push({
                    type: 'MEMORY_SPIKE',
                    subject: 'PARAMETER CHANGE ALERT - Memory Spike Detected',
                    details: {
                        'Host Name': host.name,
                        'Previous Memory Usage': `${roundValue(previous.memoryUsagePercent)}%`,
                        'Current Memory Usage': `${roundValue(host.memoryUsagePercent)}%`,
                        Change: `${roundValue(memoryDelta)} percentage points`,
                        Time: now,
                    },
                });
            }

            if ((previous.connectionState || '') !== (host.connectionState || '')
                || (previous.powerState || '') !== (host.powerState || '')) {
                events.push({
                    type: 'HOST_STATUS_CHANGE',
                    subject: 'PARAMETER CHANGE ALERT - Host Status Changed',
                    details: {
                        'Host Name': host.name,
                        'Previous Connection State': previous.connectionState || 'Unknown',
                        'Current Connection State': host.connectionState || 'Unknown',
                        'Previous Power State': previous.powerState || 'Unknown',
                        'Current Power State': host.powerState || 'Unknown',
                        Time: now,
                    },
                });
            }
        }
    }

    for (const datastore of currentSnapshot.datastores || []) {
        const previous = previousDatastores.get(datastore.name);
        const usagePercent = getDatastoreUsagePercent(datastore);
        const previousUsagePercent = previous ? getDatastoreUsagePercent(previous) : 0;

        if (usagePercent > Number(rules.diskUsageThreshold)
            && (!previous || previousUsagePercent <= Number(rules.diskUsageThreshold))) {
            events.push({
                type: 'DISK_THRESHOLD',
                subject: 'CRITICAL ALERT - Disk Usage High',
                details: {
                    Datastore: datastore.name,
                    'Current Disk Usage': `${roundValue(usagePercent)}%`,
                    Threshold: `${roundValue(rules.diskUsageThreshold)}%`,
                    Time: now,
                },
            });
        }

        if (rules.dashboardParameterChangeEnabled && previous) {
            const usageDelta = Math.abs(usagePercent - previousUsagePercent);
            if (usageDelta >= CHANGE_DELTA_THRESHOLD) {
                events.push({
                    type: 'STORAGE_CHANGE',
                    subject: 'PARAMETER CHANGE ALERT - Storage Usage Changed',
                    details: {
                        Datastore: datastore.name,
                        'Previous Usage': `${roundValue(previousUsagePercent)}%`,
                        'Current Usage': `${roundValue(usagePercent)}%`,
                        Change: `${roundValue(usageDelta)} percentage points`,
                        Time: now,
                    },
                });
            }
        }
    }

    if (rules.vmAddedAlertEnabled && currentVmList) {
        const vmAddedList = addedCandidates || currentVmList.filter((vm) => !previousVmNames.has(vm.name));

        for (const vm of vmAddedList) {
            events.push({
                type: 'VM_ADDED',
                subject: 'VM INVENTORY ALERT - VM Added',
                details: {
                    'VM Name': vm.name,
                    Host: vm.host || vm.hostName || 'Unknown',
                    'Power State': vm.powerState || vm.status || 'Unknown',
                    'vCPU Count': Number(vm.cpuCount || 0),
                    'Memory Size': formatVmMemory(vm.memory || vm.memoryMib),
                    Time: now,
                },
            });
        }
    }

    if (rules.vmPowerAlertEnabled && currentVmList) {
        for (const vm of currentVmList) {
            const previousVm = previousVmMap.get(vm.name);
            if (!previousVm || !previousVmNames.has(vm.name)) continue;

            const previousPowerState = String(previousVm.powerState || previousVm.status || '').toUpperCase();
            const currentPowerState = String(vm.powerState || vm.status || '').toUpperCase();

            if (previousPowerState && currentPowerState && previousPowerState !== currentPowerState) {
                const poweredOn = currentPowerState.includes('ON') || currentPowerState === 'RUNNING';
                events.push({
                    type: poweredOn ? 'VM_POWER_ON' : 'VM_POWER_OFF',
                    subject: poweredOn ? 'VM POWER ALERT - VM Powered On' : 'VM POWER ALERT - VM Powered Off',
                    details: {
                        'VM Name': vm.name,
                        Host: vm.host || previousVm.hostName || 'Unknown',
                        'Previous Power State': previousPowerState,
                        'Current Power State': currentPowerState,
                        'vCPU Count': Number(vm.cpuCount || previousVm.cpuCount || 0),
                        'Memory Size': formatVmMemory(vm.memory || previousVm.memoryMib),
                        Time: now,
                    },
                });
            }
        }
    }

    if (rules.vmRemovedAlertEnabled && currentVmList) {
        const vmRemovedList = deletedCandidates
            ? deletedCandidates
            : Array.from(previousVmNames)
                .filter((vmName) => !currentVmNames.has(vmName))
                .map((vmName) => ({ name: vmName, ...(previousVmMap.get(vmName) || {}) }));

        for (const deletedVm of vmRemovedList) {
            if (deletedVm?.name) {
                const previousVm = previousVmMap.get(deletedVm.name) || deletedVm;
                events.push({
                    type: 'VM_REMOVED',
                    subject: 'VM INVENTORY ALERT - VM Removed',
                    details: {
                        'VM Name': deletedVm.name,
                        Host: previousVm?.hostName || 'Unknown',
                        'Power State': previousVm?.powerState || previousVm?.status || 'Unknown',
                        'vCPU Count': Number(previousVm?.cpuCount || 0),
                        'Memory Size': formatVmMemory(previousVm?.memoryMib),
                        Time: now,
                    },
                });
            }
        }
    }

    if (currentRdu && rules.powerFailureAlertEnabled) {
        const currentPowerCut = Boolean(currentRdu?.metrics?.powerCutActive);
        const previousPowerCut = Boolean(previousRdu?.powerCutActive);

        if (currentPowerCut && !previousPowerCut) {
            events.push({
                type: 'POWER_FAILURE',
                subject: 'POWER FAILURE ALERT',
                details: {
                    Message: 'RDU detected power failure. Immediate action required.',
                    'RDU Status': currentRdu?.metrics?.rduStatus || 'Unknown',
                    'Mains Status': currentRdu?.metrics?.mainsStatus || 'Unknown',
                    Time: now,
                },
            });
        }
    }

    if (currentRdu && rules.rduAlertEnabled) {
        const currentAlarmCount = Number(currentRdu?.raw?.activeAlarmCount || currentRdu?.metrics?.activeAlarmCount || 0);
        const previousAlarmCount = Number(previousRdu?.activeAlarmCount || 0);
        const currentAlerts = normalizeRduAlerts(currentRdu.alerts || []);
        const previousAlerts = normalizeRduAlerts(previousRdu?.alerts || []);

        if (currentAlarmCount > previousAlarmCount || currentAlerts.join('|') !== previousAlerts.join('|')) {
            currentAlerts.forEach((alertTitle) => {
                events.push({
                    type: 'RDU_ALERT',
                    subject: 'CRITICAL ALERT - RDU Alarm Detected',
                    details: {
                        Alert: alertTitle,
                        'Alarm Count': currentAlarmCount,
                        Time: now,
                    },
                });
            });
        }
    }

    if (currentRdu && rules.dashboardParameterChangeEnabled && previousRdu) {
        if ((previousRdu.mainsStatus || '') !== (currentRdu?.metrics?.mainsStatus || '')
            || (previousRdu.rduStatus || '') !== (currentRdu?.metrics?.rduStatus || '')) {
            events.push({
                type: 'POWER_STATUS_CHANGE',
                subject: 'PARAMETER CHANGE ALERT - Power Status Changed',
                details: {
                    'Previous Mains Status': previousRdu.mainsStatus || 'Unknown',
                    'Current Mains Status': currentRdu?.metrics?.mainsStatus || 'Unknown',
                    'Previous RDU Status': previousRdu.rduStatus || 'Unknown',
                    'Current RDU Status': currentRdu?.metrics?.rduStatus || 'Unknown',
                    Time: now,
                },
            });
        }

        const previousVmCount = previousState?.vms?.length || 0;
        const currentVmCount = currentSnapshot.vms?.length || 0;
        if (previousVmNames.size > 0 && previousVmCount !== currentVmCount) {
            events.push({
                type: 'VM_COUNT_CHANGE',
                subject: 'PARAMETER CHANGE ALERT - VM Count Changed',
                details: {
                    'Previous VM Count': previousVmCount,
                    'Current VM Count': currentVmCount,
                    Time: now,
                },
            });
        }
    }

    return events.map((event) => ({
        ...event,
        timestamp: event.timestamp || timestamp,
    }));
}

async function processSnapshot(currentSnapshot = {}) {
    try {
        const { smtpSettings, alertRules } = await getAlertConfiguration();
        const previousState = currentSnapshot.previousState || await getPreviousSnapshotState();
        const currentHosts = (currentSnapshot.hosts || []).map((host) => ({
            ...host,
            temperatureC: currentSnapshot.iloPayload?.servers?.find((server) => server.serverName === host.name)?.temperature?.inlet
                ?? currentSnapshot.iloPayload?.servers?.find((server) => server.serverName === host.name)?.temperature?.cpuAvg
                ?? null,
        }));

        const events = buildEvents({
            currentSnapshot: {
                ...currentSnapshot,
                hosts: currentHosts,
            },
            previousState,
            rules: alertRules,
        });

        if (!events.length) {
            return { skipped: true, reason: 'No alert events detected' };
        }

        await storeGeneratedAlertEvents(null, events, new Date());

        if (!smtpSettings?.alertsEnabled) {
            return { recorded: events.length, emailSkipped: true, reason: 'Alerts disabled' };
        }

        if (!smtpSettings?.smtpHost || !smtpSettings?.senderEmail || !(smtpSettings?.alertRecipientEmails || []).length) {
            return { recorded: events.length, emailSkipped: true, reason: 'SMTP configuration incomplete' };
        }

        for (const event of events) {
            const message = buildAlertEmail(event);
            await sendMail(message);
        }

        return { recorded: events.length, sent: events.length };
    } catch (error) {
        console.error('[Alert Engine]', error.message);
        return { error: error.message };
    }
}

module.exports = {
    processSnapshot,
};
