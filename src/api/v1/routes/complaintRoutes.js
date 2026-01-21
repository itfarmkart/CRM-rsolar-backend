const express = require('express');
const router = express.Router();
const complaintController = require('../controllers/complaintController');

router.get('/', complaintController.getComplaints);
router.get('/categories', complaintController.getCategories);
router.get('/departments', complaintController.getDepartments);
router.post('/', complaintController.createComplaint);
router.patch('/:id/status', complaintController.updateComplaintStatus);

module.exports = router;
