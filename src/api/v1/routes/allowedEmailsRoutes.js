const express = require('express');
const router = express.Router();
const allowedEmailsController = require('../controllers/allowedEmailsController');

router.get('/', allowedEmailsController.getAllowedEmails);

module.exports = router;
