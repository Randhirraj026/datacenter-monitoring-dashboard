const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

// Mock env variables
process.env.JWT_SECRET = 'test-secret';
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASSWORD = 'password123';
process.env.SUPERADMIN_USERNAME = 'superadmin';
process.env.SUPERADMIN_PASSWORD = 'superpassword123';

const { mountAuthRoutes, verifyToken, requireRole } = require('../auth');

describe('Auth Module', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    mountAuthRoutes(app);
    
    // Protected test routes
    app.get('/api/test-protected', verifyToken, (req, res) => {
      res.json({ message: 'Success', user: req.user });
    });

    app.get('/api/test-superadmin', verifyToken, requireRole('superadmin'), (req, res) => {
      res.json({ message: 'Superadmin Access' });
    });
  });

  describe('POST /api/login', () => {
    it('should login as admin with correct credentials', async () => {
      const res = await request(app)
        .post('/api/login')
        .send({ username: 'admin', password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.role).toBe('admin');
      expect(res.body.token).toBeDefined();
    });

    it('should login as superadmin with correct credentials', async () => {
      const res = await request(app)
        .post('/api/login')
        .send({ username: 'superadmin', password: 'superpassword123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.role).toBe('superadmin');
      expect(res.body.token).toBeDefined();
    });

    it('should fail with invalid credentials', async () => {
      const res = await request(app)
        .post('/api/login')
        .send({ username: 'wrong', password: 'wrong' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Invalid credentials');
    });
  });

  describe('JWT Verification Middleware', () => {
    it('should allow access with valid token', async () => {
      const token = jwt.sign({ username: 'admin', role: 'admin' }, 'test-secret');
      
      const res = await request(app)
        .get('/api/test-protected')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Success');
      expect(res.body.user.username).toBe('admin');
    });

    it('should deny access without token', async () => {
      const res = await request(app).get('/api/test-protected');
      expect(res.status).toBe(401);
    });

    it('should deny access with expired or invalid token', async () => {
      const res = await request(app)
        .get('/api/test-protected')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(403);
    });
  });

  describe('Role-based Access Control', () => {
    it('should allow superadmin to access superadmin route', async () => {
      const token = jwt.sign({ username: 'superadmin', role: 'superadmin' }, 'test-secret');
      
      const res = await request(app)
        .get('/api/test-superadmin')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Superadmin Access');
    });

    it('should deny admin from accessing superadmin route', async () => {
      const token = jwt.sign({ username: 'admin', role: 'admin' }, 'test-secret');
      
      const res = await request(app)
        .get('/api/test-superadmin')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });
  });
});
