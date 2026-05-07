const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getSecretKey() {
    const baseSecret = process.env.SMTP_SECRET_KEY || process.env.JWT_SECRET || 'datacenter-dashboard-default-secret';
    return crypto.createHash('sha256').update(String(baseSecret)).digest();
}

function encryptValue(value) {
    if (!value) return '';

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, getSecretKey(), iv);
    const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptValue(value) {
    if (!value) return '';

    const parts = String(value).split(':');
    if (parts.length !== 3) {
        return String(value);
    }

    const [ivHex, authTagHex, encryptedHex] = parts;
    try {
        const decipher = crypto.createDecipheriv(ALGORITHM, getSecretKey(), Buffer.from(ivHex, 'hex'));
        decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

        const decrypted = Buffer.concat([
            decipher.update(Buffer.from(encryptedHex, 'hex')),
            decipher.final(),
        ]);

        return decrypted.toString('utf8');
    } catch (error) {
        throw new Error('Stored SMTP password could not be decrypted. Please re-enter and save the SMTP password again.', { cause: error });
    }
}

module.exports = {
    encryptValue,
    decryptValue,
};
