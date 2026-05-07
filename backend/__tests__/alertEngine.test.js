const { processSnapshot } = require('../services/alertEngine');
const { getAlertConfiguration, getPreviousSnapshotState } = require('../db/alertSettings');
const { storeGeneratedAlertEvents } = require('../db');
const { sendMail } = require('../services/mailService');

// Mock dependencies
jest.mock('../db/alertSettings');
jest.mock('../db');
jest.mock('../services/mailService');

describe('Alert Engine', () => {
    const mockRules = {
        cpuUsageThreshold: 80,
        memoryUsageThreshold: 85,
        temperatureThreshold: 35,
        diskUsageThreshold: 90,
        hostDownAlertEnabled: true,
        vmAddedAlertEnabled: true,
        vmRemovedAlertEnabled: true,
        vmPowerAlertEnabled: true,
        powerFailureAlertEnabled: true,
        rduAlertEnabled: true,
        dashboardParameterChangeEnabled: true,
    };

    const mockSmtp = {
        alertsEnabled: true,
        smtpHost: 'smtp.example.com',
        senderEmail: 'alerts@example.com',
        alertRecipientEmails: ['admin@example.com'],
    };

    beforeEach(() => {
        jest.clearAllMocks();
        getAlertConfiguration.mockResolvedValue({ smtpSettings: mockSmtp, alertRules: mockRules });
    });

    it('should generate an alert when CPU usage exceeds threshold', async () => {
        const currentSnapshot = {
            hosts: [{ name: 'Host 1', cpuUsagePercent: 90 }],
            previousState: { hosts: [{ name: 'Host 1', cpuUsagePercent: 50 }] },
        };

        const result = await processSnapshot(currentSnapshot);

        expect(storeGeneratedAlertEvents).toHaveBeenCalled();
        const events = storeGeneratedAlertEvents.mock.calls[0][1];
        expect(events.some(e => e.type === 'CPU_THRESHOLD')).toBe(true);
        expect(sendMail).toHaveBeenCalled();
    });

    it('should detect a new VM and generate an alert', async () => {
        const currentSnapshot = {
            vms: [{ name: 'New VM', host: 'Host 1', status: 'RUNNING' }],
            previousState: { vms: [] }, // No VMs previously
        };

        const result = await processSnapshot(currentSnapshot);

        const events = storeGeneratedAlertEvents.mock.calls[0][1];
        expect(events.some(e => e.type === 'VM_ADDED')).toBe(true);
    });

    it('should detect RDU power failure', async () => {
        const currentSnapshot = {
            rduPayload: { metrics: { powerCutActive: true } },
            previousState: { rdu: { powerCutActive: false } },
        };

        const result = await processSnapshot(currentSnapshot);

        const events = storeGeneratedAlertEvents.mock.calls[0][1];
        expect(events.some(e => e.type === 'POWER_FAILURE')).toBe(true);
    });

    it('should not send email if alerts are disabled in SMTP settings', async () => {
        getAlertConfiguration.mockResolvedValueOnce({ 
            smtpSettings: { ...mockSmtp, alertsEnabled: false }, 
            alertRules: mockRules 
        });

        const currentSnapshot = {
            hosts: [{ name: 'Host 1', cpuUsagePercent: 95 }],
            previousState: { hosts: [{ name: 'Host 1', cpuUsagePercent: 50 }] },
        };

        const result = await processSnapshot(currentSnapshot);

        expect(storeGeneratedAlertEvents).toHaveBeenCalled();
        expect(sendMail).not.toHaveBeenCalled();
        expect(result.emailSkipped).toBe(true);
    });
});
