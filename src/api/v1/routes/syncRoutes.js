const express = require('express');
const router = express.Router();
const syncController = require('../controllers/syncController');

// Sync Mission Control Data
router.post('/mission-control-data', syncController.syncMissionControlData);
router.post('/on-update-convert-booking', syncController.onUpdateConvertBookingWebhook);

module.exports = router;
