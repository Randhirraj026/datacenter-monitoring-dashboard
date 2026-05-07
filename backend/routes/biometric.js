const express = require('express');
const path = require('path');
const { 
    fetchServerRoomAccessLogs, 
    getLogWindowForDate
} = require('../services/biometricService');
const {
    deleteEmployee,
    getEmployeeLatestPhotoPath,
    getUnknownFaceById,
    getEmployeeDirectory,
    getUnknownFaces,
    reviewUnknownFace,
    saveEmployeeEmbeddings,
    upsertEmployeeRecord,
} = require('../services/faceRecognitionService');

const router = express.Router();

router.get('/server-room', async (req, res) => {
    try {
        const date = req.query?.date ? String(req.query.date) : undefined;
        const logs = await fetchServerRoomAccessLogs({ date });
        const window = getLogWindowForDate(date);

        return res.json({
            date: window.date,
            windowStart: window.start,
            windowEnd: window.end,
            logs,
        });
    } catch (error) {
        console.error('[Route /biometric/server-room]', error.message);
        return res.status(502).json({
            error: error.message || 'Unable to fetch biometric access logs',
        });
    }
});

router.get('/employees', async (req, res) => {
    try {
        const employees = await getEmployeeDirectory();
        return res.json(employees);
    } catch (error) {
        console.error('[Route /biometric/employees GET]', error.message);
        return res.status(500).json({ error: error.message });
    }
});

router.put('/employees', async (req, res) => {
    try {
        const { employee_id, name, department } = req.body;
        if (!employee_id || !name) {
            return res.status(400).json({ error: 'employee_id and name are required' });
        }
        const updated = await upsertEmployeeRecord({ employee_id, name, department });
        return res.json(updated);
    } catch (error) {
        console.error('[Route /biometric/employees PUT]', error.message);
        return res.status(500).json({ error: error.message });
    }
});

router.get('/employees/:id/photo', async (req, res) => {
    try {
        const { id } = req.params;
        const photoPath = await getEmployeeLatestPhotoPath(id);

        if (!photoPath) {
            return res.status(404).json({ error: 'Employee photo not found' });
        }

        return res.sendFile(path.resolve(photoPath));
    } catch (error) {
        console.error('[Route /biometric/employees/:id/photo GET]', error.message);
        return res.status(500).json({ error: error.message });
    }
});

router.post('/employees/:id/photos', async (req, res) => {
    try {
        const { id } = req.params;
        const { images = [] } = req.body || {};

        const enrollment = await saveEmployeeEmbeddings(id, images);
        return res.status(201).json({
            message: 'Employee photo added successfully',
            embeddingsStored: enrollment.embeddingsStored,
            employee: enrollment.employee,
        });
    } catch (error) {
        console.error('[Route /biometric/employees/:id/photos POST]', error.message);
        return res.status(400).json({ error: error.message });
    }
});

router.delete('/employees/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await deleteEmployee(id);
        return res.json({ success: true });
    } catch (error) {
        console.error('[Route /biometric/employees DELETE]', error.message);
        return res.status(500).json({ error: error.message });
    }
});

router.get('/unknown-faces', async (req, res) => {
    try {
        const limit = req.query?.limit ? Number(req.query.limit) : 25;
        const faces = await getUnknownFaces(limit);
        return res.json(faces);
    } catch (error) {
        console.error('[Route /biometric/unknown-faces GET]', error.message);
        return res.status(500).json({ error: error.message });
    }
});

router.get('/unknown-faces/:id/image', async (req, res) => {
    try {
        const { id } = req.params;
        const face = await getUnknownFaceById(id);

        if (!face?.image_path) {
            return res.status(404).json({ error: 'Unknown face image not found' });
        }

        return res.sendFile(path.resolve(face.image_path));
    } catch (error) {
        console.error('[Route /biometric/unknown-faces/:id/image GET]', error.message);
        return res.status(500).json({ error: error.message });
    }
});

router.post('/add-employee', async (req, res) => {
    try {
        const {
            employee_id: employeeId,
            name,
            department = 'General',
            images = [],
        } = req.body || {};

        if (!employeeId || !name) {
            return res.status(400).json({ error: 'employee_id and name are required' });
        }

        const employee = await upsertEmployeeRecord({
            employee_id: employeeId,
            name,
            department,
        });

        const enrollment = await saveEmployeeEmbeddings(employeeId, images);
        return res.status(201).json({
            message: 'Employee enrolled successfully',
            employee,
            embeddingsStored: enrollment.embeddingsStored,
        });
    } catch (error) {
        console.error('[Route /biometric/add-employee POST]', error.message);
        return res.status(400).json({ error: error.message });
    }
});

router.post('/review-unknown', async (req, res) => {
    try {
        const result = await reviewUnknownFace(req.body || {});
        return res.json({
            message: 'Unknown face review completed',
            ...result,
        });
    } catch (error) {
        console.error('[Route /biometric/review-unknown POST]', error.message);
        return res.status(400).json({ error: error.message });
    }
});

router.post('/capture-unknown', async (req, res) => {
    try {
        const { fetchServerRoomSnapshotBuffer } = require('../services/cameraFrameService');
        const { saveUnknownFace } = require('../services/faceRecognitionService');
        const { detectFaces } = require('../services/faceDetectionService');
        
        const snapshot = await fetchServerRoomSnapshotBuffer();
        const faces = await detectFaces(snapshot.buffer, snapshot.contentType);
        
        let targetBuffer = snapshot.buffer;
        let reason = 'MANUAL_CAPTURE_FULL';

        if (faces && faces.length > 0) {
            // Sort by confidence or size to find the best face
            const bestFace = faces.sort((a, b) => b.confidence - a.confidence)[0];
            if (bestFace.cropBuffer) {
                targetBuffer = bestFace.cropBuffer;
                reason = 'MANUAL_CAPTURE_FACE';
            }
        }
        
        const stored = await saveUnknownFace({
            frameBuffer: targetBuffer,
            contentType: snapshot.contentType,
            reason,
            trackKey: `manual-${Date.now()}`,
            alertKey: `manual-${Date.now()}`,
        });

        return res.json({
            message: reason === 'MANUAL_CAPTURE_FACE' ? 'Face captured and cropped successfully' : 'Live frame captured successfully (no face detected)',
            face: stored,
        });
    } catch (error) {
        console.error('[Route /biometric/capture-unknown POST]', error.message);
        return res.status(500).json({ error: error.message });
    }
});

module.exports = router;
