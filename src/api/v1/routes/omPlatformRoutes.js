const express = require('express');
const router = express.Router();
const omPlatformController = require('../controllers/omPlatformController');

// O&M Dashboard Summary
router.get('/summary', omPlatformController.getOMSummary);

// O&M Device List with Customer Mapping
router.get('/devices', omPlatformController.getOMDevices);

// O&M Site Detail
router.get('/sites/:siteId', omPlatformController.getSiteDetail);

module.exports = router;
