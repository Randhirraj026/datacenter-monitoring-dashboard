const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const cameraStreamService = require('../services/cameraStreamService');

const status = cameraStreamService.getServerRoomHlsStatus();
console.log(JSON.stringify(status, null, 2));
