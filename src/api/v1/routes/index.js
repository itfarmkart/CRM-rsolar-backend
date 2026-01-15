const express = require('express');
const router = express.Router();
const healthController = require('../controllers/healthController');
const customerRoutes = require('./customerRoutes');

// Health Check
router.get('/health', healthController.getHealth);

// Customers
router.use('/customers', customerRoutes);

module.exports = router;
