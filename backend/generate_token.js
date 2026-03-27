require('dotenv').config();
const jwt = require('jsonwebtoken');
const fs = require('fs');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '8h';
const username = process.env.SUPERADMIN_USERNAME || process.env.VITE_SUPERADMIN_USERNAME;

const token = jwt.sign(
    { username, role: 'superadmin' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
);

fs.writeFileSync('token.txt', token);
