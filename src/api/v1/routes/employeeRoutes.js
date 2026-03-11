const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');

/**
 * @route POST /api/v1/employees/permissions
 * @desc Get module-level permissions for an employee by email
 * @access Public (Add auth middleware if needed later)
 */
router.post('/permissions', employeeController.getEmployeePermissions);

module.exports = router;
