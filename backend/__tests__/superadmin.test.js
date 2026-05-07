const request = require('supertest');
const express = require('express');
const { Pool } = require('pg');

// Mock PG Pool
jest.mock('pg', () => {
    const mPool = {
        query: jest.fn(),
        on: jest.fn(),
        end: jest.fn(),
        connect: jest.fn(),
    };
    return { Pool: jest.fn(() => mPool) };
});

const mockPool = new Pool();

// Mock env variables for auth and DB
process.env.JWT_SECRET = 'test-secret';
process.env.PGHOST = 'localhost';
process.env.PGUSER = 'postgres';
process.env.PGDATABASE = 'testdb';

const { verifyToken, requireRole } = require('../auth');

// Mock services to prevent external calls
jest.mock('../services/metricsStoreService', () => ({
    ensureFreshSnapshot: jest.fn().mockResolvedValue(true)
}));

// Import router
const superadminRouter = require('../routes/superadmin');

describe('SuperAdmin Registry Routes', () => {
    let app;

    beforeEach(() => {
        jest.clearAllMocks();
        app = express();
        app.use(express.json());

        // Mock auth middleware to bypass for specific tests or provide user
        app.use((req, res, next) => {
            req.user = { username: 'admin', role: 'superadmin' };
            next();
        });

        app.use('/api/superadmin', superadminRouter);
    });

    describe('GET /api/superadmin/dashboard', () => {
        it('should return dashboard data', async () => {
            // Mock all 7 queries executed by getSuperAdminDashboardData
            const mockRows = { rows: [] };
            
            mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Host 1' }] }); // hosts
            mockPool.query.mockResolvedValueOnce({ rows: [{ host_id: 1, cpu_usage_pct: 10, memory_usage_pct: 15 }] }); // host metrics
            mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1, vm_name: 'VM 1' }] }); // vms
            mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1, datastore_name: 'DS 1' }] }); // datastores
            mockPool.query.mockResolvedValueOnce({ rows: [{ ts: new Date(), total_power_kw: 1.5 }] }); // power history
            mockPool.query.mockResolvedValueOnce({ rows: [{ ok: true, power_cut_active: false }] }); // rdu
            mockPool.query.mockResolvedValueOnce({ rows: [{ type: 'SYSTEM', message: 'Alert' }] }); // alerts

            const res = await request(app).get('/api/superadmin/dashboard');

            if (res.status !== 200) {
                console.error('Test failed with body:', res.body);
            }

            expect(res.status).toBe(200);
            expect(res.body.hosts).toBeDefined();
            expect(res.body.allVMs).toBeDefined();
        });
    });

    describe('GET /api/superadmin/predict', () => {
        it('should return 400 if parameters are missing', async () => {
            const res = await request(app).get('/api/superadmin/predict');
            expect(res.status).toBe(400);
        });

        it('should proxy request to ML service', async () => {
            // Mock global fetch
            global.fetch = jest.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ prediction: [10, 20, 30] }),
                })
            );

            const res = await request(app)
                .get('/api/superadmin/predict')
                .query({ host_id: 1, metric: 'cpu', range: '1h' });

            expect(res.status).toBe(200);
            expect(res.body.prediction).toEqual([10, 20, 30]);
            expect(global.fetch).toHaveBeenCalled();
        });
    });
});
