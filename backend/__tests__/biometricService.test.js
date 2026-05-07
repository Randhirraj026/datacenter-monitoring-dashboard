const { getLogWindowForDate, fetchServerRoomAccessLogs } = require('../services/biometricService');
const mssql = require('mssql');

// Mock mssql
jest.mock('mssql', () => {
    const mRequest = {
        input: jest.fn().mockReturnThis(),
        query: jest.fn(),
    };
    const mPool = {
        connect: jest.fn().mockResolvedValue(),
        close: jest.fn().mockResolvedValue(),
        request: jest.fn(() => mRequest),
    };
    return {
        ConnectionPool: jest.fn(() => mPool),
        VarChar: jest.fn(),
    };
});

describe('Biometric Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Setup env for SQL Server mode
        process.env.BIOMETRIC_SOURCE = 'sqlserver';
        process.env.BIOMETRIC_SQLSERVER_HOST = 'localhost';
        process.env.BIOMETRIC_SQLSERVER_USER = 'sa';
        process.env.BIOMETRIC_SQLSERVER_PASSWORD = 'password';
        process.env.BIOMETRIC_SQLSERVER_DATABASE = 'SAVIOR';
    });

    describe('getLogWindowForDate', () => {
        it('should return correct window for a date string', () => {
            const window = getLogWindowForDate('2024-04-22', 'UTC');
            expect(window.date).toBe('2024-04-22');
            expect(window.startMs).toBe(new Date(Date.UTC(2024, 3, 22)).getTime());
        });
    });

    describe('fetchServerRoomAccessLogs (SQL Server)', () => {
        it('should fetch and normalize logs', async () => {
            const mockRequest = new mssql.ConnectionPool().request();
            mockRequest.query.mockResolvedValueOnce({
                recordset: [
                    {
                        cardno: '123',
                        employeeName: 'John Doe',
                        officepunch: new Date('2024-04-22T10:00:00Z'),
                        mc_no: '00054',
                        inout: 'I'
                    }
                ]
            });

            const logs = await fetchServerRoomAccessLogs({ date: '2024-04-22' });

            expect(logs.length).toBe(1);
            expect(logs[0].name).toBe('John Doe');
            expect(logs[0].access).toBe('IN');
        });

        it('should filter logs by allowed serials if configured', async () => {
            process.env.BIOMETRIC_MACHINE_SERIALS = '00054';
            const mockRequest = new mssql.ConnectionPool().request();
            mockRequest.query.mockResolvedValueOnce({
                recordset: [
                    { mc_no: '00054', cardno: 'A', inout: 'I', officepunch: new Date() },
                    { mc_no: '99999', cardno: 'B', inout: 'O', officepunch: new Date() }
                ]
            });

            const logs = await fetchServerRoomAccessLogs({ date: '2024-04-22' });
            
            // Note: The service filters locally in normalizeSqlServerRows AND by SQL query.
            // Our mock returns both, so we test the local normalization filter.
            expect(logs.length).toBe(1);
            expect(logs[0].employeeId).toBe('A');
        });
    });
});
