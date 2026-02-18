const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');

router.get('/', customerController.getCustomers);
router.get('/districts', customerController.getDistricts);
router.get('/distric', customerController.getDistricts); // Supporting user's specific typo/request
// Zoho Inventory Integration
router.get('/zoho-inventory', customerController.listAllZohoInvoicedCustomers);
router.get('/zoho-inventory/:mobileNumber', customerController.getZohoInventoryDetails);
router.get('/zoho-inventory/:mobileNumber/bill', customerController.getZohoInventoryBill);
router.get('/verify-s3', customerController.verifyS3Object);
router.get('/:id', customerController.getCustomerById);

module.exports = router;
