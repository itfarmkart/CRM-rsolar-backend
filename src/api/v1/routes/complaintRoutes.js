const express = require('express');
const router = express.Router();
const complaintController = require('../controllers/complaintController');

router.get('/', complaintController.getComplaints);
router.get('/categories', complaintController.getCategories);
router.get('/parent-categories', complaintController.getParentCategories);
router.get('/departments', complaintController.getDepartments);
router.get('/assign-reminder', complaintController.assignReminder);
router.post('/', complaintController.createComplaint);
router.patch('/:id/status', complaintController.updateComplaintStatus);
router.get('/:id/updates', complaintController.getComplaintUpdates);
router.get('/auth-emails', complaintController.getAuthEmails);
router.get('/report/department-wise-not-verified', complaintController.getDepartmentWiseNotVerifiedComplaints);
router.get('/:id', complaintController.getComplaintDetails);
router.post('/updates', complaintController.createComplaintUpdate);

module.exports = router;
