const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const cameraFrameService = require('../services/cameraFrameService');
const personDetectionService = require('../services/personDetectionService');

async function debugDetection() {
    try {
        console.log('Capturing snapshot...');
        const snapshot = await cameraFrameService.fetchServerRoomSnapshotBuffer();
        console.log('Snapshot captured. Content-Type:', snapshot.contentType);

        console.log('Analyzing live frame...');
        const result = await personDetectionService.analyzeLiveFrame(snapshot.buffer, snapshot.contentType);
        
        console.log('Detection Results:');
        console.log(JSON.stringify(result, null, 2));

        if (result.personCount === 0) {
            console.log('\nNO PERSONS DETECTED.');
            console.log('Check if the person is clearly visible and upright.');
            console.log('Wait, let me check the person_detection_service logs...');
        }
    } catch (error) {
        console.error('Error during debug:', error.message);
    }
}

debugDetection();
