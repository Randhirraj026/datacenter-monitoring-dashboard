'use strict';
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { fetchServerRoomSnapshotBuffer } = require('../services/cameraFrameService');
const fs = require('fs').promises;

async function test() {
    console.log('Testing local HLS frame capture...');
    try {
        const result = await fetchServerRoomSnapshotBuffer();
        console.log('Capture success!');
        console.log('Content Type:', result.contentType);
        console.log('Buffer size:', result.buffer.length);
        console.log('Source:', result.sourceUrl);
        
        await fs.writeFile('scratch/test_capture.jpg', result.buffer);
        console.log('Saved to scratch/test_capture.jpg');
    } catch (err) {
        console.error('Capture failed:', err);
    }
}

test();
