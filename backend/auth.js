const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '8h';

if (!JWT_SECRET) {
    console.error('JWT_SECRET is missing in .env');
    process.exit(1);
}

function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }

        req.user = decoded;
        next();
    });
}

function requireRole(role) {
    return (req, res, next) => {
        if (!req.user || req.user.role !== role) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        next();
    };
}

function getSuperAdminUser() {
    return process.env.SUPERADMIN_USERNAME || process.env.VITE_SUPERADMIN_USERNAME;
}

function getSuperAdminPassword() {
    return process.env.SUPERADMIN_PASSWORD || process.env.VITE_SUPERADMIN_PASSWORD;
}

function mountAuthRoutes(app) {
    app.post('/api/login', (req, res) => {
        const { username, password } = req.body || {};

        const adminUser = process.env.ADMIN_USER;
        const adminPassword = process.env.ADMIN_PASSWORD;
        const superAdminUser = getSuperAdminUser();
        const superAdminPassword = getSuperAdminPassword();

        if (username === superAdminUser && password === superAdminPassword) {
            const token = jwt.sign(
                { username, role: 'superadmin' },
                JWT_SECRET,
                { expiresIn: JWT_EXPIRES }
            );

            return res.json({
                success: true,
                token,
                role: 'superadmin',
                route: '/superadmin'
            });
        }

        if (username === adminUser && password === adminPassword) {
            const token = jwt.sign(
                { username, role: 'admin' },
                JWT_SECRET,
                { expiresIn: JWT_EXPIRES }
            );

            return res.json({
                success: true,
                token,
                role: 'admin',
                route: '/dashboard'
            });
        }

        return res.status(401).json({ success: false, error: 'Invalid credentials' });
    });

    app.post('/api/logout', (_req, res) => res.json({ success: true }));
}

module.exports = { verifyToken, requireRole, mountAuthRoutes };
