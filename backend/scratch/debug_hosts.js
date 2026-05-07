'use strict';
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { getHosts } = require('../services/vsphereService');

async function debug() {
    console.log('Fetching hosts...');
    try {
        const result = await getHosts({ forceRefresh: true });
        console.log('Result:', JSON.stringify(result, null, 2));
    } catch (err) {
        console.error('Error:', err);
    }
}

debug();
