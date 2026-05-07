const { getVMs, getHosts } = require('../services/vsphereService');
const https = require('https');
const { EventEmitter } = require('events');

// Mock https.request
jest.mock('https');

function mockResponse(status, body) {
    const res = new EventEmitter();
    process.nextTick(() => {
        res.emit('data', body);
        res.emit('end');
    });
    res.statusCode = status;
    res.headers = {};
    return res;
}

describe('VSphere Service', () => {
    let mockReq;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.VMWARE_HOST = 'vcenter.local';
        process.env.VMWARE_USER = 'admin';
        process.env.VMWARE_PASS = 'pass';

        mockReq = new EventEmitter();
        mockReq.write = jest.fn();
        mockReq.end = jest.fn();
        mockReq.setTimeout = jest.fn();
        mockReq.destroy = jest.fn();
        
        https.request.mockImplementation((options, callback) => {
            // Determine which mock response to return based on path
            if (options.path.includes('/rest/com/vmware/cis/session')) {
                callback(mockResponse(200, '"token123"'));
            } else if (options.path.includes('/rest/vcenter/vm')) {
                callback(mockResponse(200, JSON.stringify({ value: [{ name: 'VM 1', power_state: 'POWERED_ON', cpu_count: 4, memory_size_MiB: 8192 }] })));
            } else if (options.path.includes('/rest/vcenter/host')) {
                callback(mockResponse(200, JSON.stringify({ value: [{ host: 'host-1', name: 'Host 1' }] })));
            } else {
                callback(mockResponse(404, 'Not Found'));
            }
            return mockReq;
        });
    });

    describe('getVMs', () => {
        it('should fetch and format VM list', async () => {
            const result = await getVMs({ forceRefresh: true });

            expect(result.list.length).toBe(1);
            expect(result.list[0].name).toBe('VM 1');
            expect(result.list[0].powerState).toBe('POWERED_ON');
        });
    });

    describe('getHosts', () => {
        it('should fetch and format Host list', async () => {
            const result = await getHosts();

            expect(result.hosts.length).toBe(1);
            expect(result.hosts[0].name).toBe('Host 1');
        });
    });
});
