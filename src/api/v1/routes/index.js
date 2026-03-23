const express = require('express');
const router = express.Router();
const healthController = require('../controllers/healthController');
const customerRoutes = require('./customerRoutes');

// Health Check
router.get('/health', healthController.getHealth);

// Customers
router.use('/customers', customerRoutes);

// Complaints
router.use('/complaints', require('./complaintRoutes'));

// Allowed Emails
router.use('/allowed-emails', require('./allowedEmailsRoutes'));

// O&M Platform
router.use('/om-platform', require('./omPlatformRoutes'));

// Call Recordings
router.use('/call-recordings', require('./callRecordingRoutes'));

// Employees & Permissions
router.use('/employees', require('./employeeRoutes'));

// Sync
router.use('/sync', require('./syncRoutes'));

// Zoho Sync
router.use('/zoho', require('./zohoSyncRoutes'));

module.exports = router;
