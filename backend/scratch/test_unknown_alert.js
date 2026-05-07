'use strict';
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { saveUnknownFace } = require('../services/faceRecognitionService');
const fs = require('fs').promises;

async function test() {
    console.log('Simulating unknown face detection...');
    
    // Create a dummy buffer
    const dummyBuffer = Buffer.from('dummy image data');
    
    try {
        const result = await saveUnknownFace({
            frameBuffer: dummyBuffer,
            contentType: 'image/jpeg',
            trackKey: 'test-track-' + Date.now(),
            reason: 'TEST_UNKNOWN',
            similarity: 0.1
        });
        
        if (result) {
            console.log('Alert triggered successfully:', result.imagePath);
        } else {
            console.log('Alert was skipped (likely due to cooldown).');
        }
    } catch (err) {
        console.error('Test failed:', err);
    }
}

test();
