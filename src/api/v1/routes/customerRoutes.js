const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');

router.get('/', customerController.getCustomers);
router.get('/districts', customerController.getDistricts);
router.get('/distric', customerController.getDistricts); // Supporting user's specific typo/request
router.get('/:id', customerController.getCustomerById);

module.exports = router;
