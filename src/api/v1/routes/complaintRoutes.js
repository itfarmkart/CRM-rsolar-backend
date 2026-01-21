const express = require('express');
const router = express.Router();
const complaintController = require('../controllers/complaintController');

router.get('/', complaintController.getComplaints);

module.exports = router;
