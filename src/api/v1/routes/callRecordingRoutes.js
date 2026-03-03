const express = require('express');
const router = express.Router();
const callRecordingController = require('../controllers/callRecordingController');

/**
 * @route GET /api/v1/call-recordings/list
 * @desc Get list of all call recordings
 * @access Public
 */
router.get('/list', callRecordingController.listRecordings);

/**
 * @route POST /api/v1/call-recordings/process
 * @desc Process a call recording (fetch, transcribe, summarize, categorize)
 * @access Public (Add auth middleware if needed later)
 */
router.post('/process', callRecordingController.processRecording);

/**
 * @route POST /api/v1/call-recordings/process-gemini
 * @desc Process a call recording using Gemini 1.5 (fetch, transcribe, summarize, categorize)
 * @access Public
 */
router.post('/process-gemini', callRecordingController.processRecordingGemini);

/**
 * @route POST /api/v1/call-recordings/webhook
 * @desc Receive call events (webhooks) from Smartflo and log them to a file
 * @access Public
 */
router.post('/webhook', callRecordingController.handleWebhook);

/**
 * @route GET /api/v1/call-recordings/process-pending
 * @desc Process pending call recordings
 * @access Public (Add auth middleware if needed later)
 */
router.get('/process-pending', callRecordingController.processPending);

/**
 * @route GET /api/v1/call-recordings/mobile/:mobile_number
 * @desc Get all call recordings for a specific mobile number
 * @access Public
 */
router.get('/mobile/:mobile_number', callRecordingController.getRecordingsByMobile);

/**
 * @route GET /api/v1/call-recordings/test
 * @desc Test routing to call-recordings
 * @access Public
 */
router.get('/test', (req, res) => res.json({ message: 'Routing to call-recordings is working!' }));

module.exports = router;
