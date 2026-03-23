const express = require('express');
const router = express.Router();
const zohoSyncController = require('../controllers/zohoSyncController');

router.post('/sync/bulk', zohoSyncController.bulkSyncZohoData);
router.post('/sync/:mobileNumber', zohoSyncController.syncZohoDataByMobile);

module.exports = router;
