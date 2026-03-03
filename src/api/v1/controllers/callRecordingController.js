const callRecordingService = require('../services/callRecordingService');
const fs = require('fs');
const path = require('path');
const db = require('../../../database/db');

const processRecording = async (req, res) => {
    const { call_id, recording_url } = req.body;

    if (!call_id && !recording_url) {
        return res.status(400).json({ status: 'error', message: 'Either call_id or recording_url is required' });
    }

    let filePath;
    try {
        let finalUrl = recording_url;

        // If call_id is provided, fetch the recording URL from Cloudphone
        if (call_id) {
            console.log(`Fetching recording URL for call_id: ${call_id}`);
            finalUrl = await callRecordingService.getRecordingUrl(call_id);
        }

        console.log(`Downloading recording from: ${finalUrl}`);
        filePath = await callRecordingService.downloadRecording(finalUrl);

        console.log(`Processing recording with GPT-4o Audio...`);
        const result = await callRecordingService.processAudioWithGPT4o(filePath);

        // Clean up: delete the temporary audio file
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        res.status(200).json({
            status: 'success',
            data: {
                transcription: result.transcription,
                summary: result.bulletPoints,
                category: result.category
            }
        });

    } catch (error) {
        console.error('Error in processRecording controller:', error.message);

        // Clean up file if error occurs
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        res.status(500).json({
            status: 'error',
            message: error.message || 'An error occurred while processing the recording'
        });
    }
};

const listRecordings = async (req, res) => {
    try {
        const queryParams = req.query;
        console.log('Fetching list of recordings from Cloudphone...');
        const recordings = await callRecordingService.getAllRecordings(queryParams);

        res.status(200).json({
            status: 'success',
            count: recordings.length,
            data: recordings
        });
    } catch (error) {
        console.error('Error in listRecordings controller:', error.message);
        res.status(500).json({
            status: 'error',
            message: error.message || 'An error occurred while fetching recording list'
        });
    }
};

const processRecordingGemini = async (req, res) => {
    const { call_id, recording_url } = req.body;

    if (!call_id && !recording_url) {
        return res.status(400).json({ status: 'error', message: 'Either call_id or recording_url is required' });
    }

    let filePath;
    try {
        let finalUrl = recording_url;

        if (call_id) {
            console.log(`Fetching recording URL for call_id: ${call_id}`);
            finalUrl = await callRecordingService.getRecordingUrl(call_id);
        }

        console.log(`Downloading recording from: ${finalUrl}`);
        filePath = await callRecordingService.downloadRecording(finalUrl);

        console.log(`Processing recording with Gemini 1.5...`);
        const result = await callRecordingService.processAudioWithGemini(filePath);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        res.status(200).json({
            status: 'success',
            data: {
                // transcription: result.transcription,
                // summary: result.bulletPoints,
                // category: result.category
                result
            }
        });

    } catch (error) {
        console.error('Error in processRecordingGemini controller:', error.message);
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        res.status(500).json({
            status: 'error',
            message: error.message || 'An error occurred while processing the recording with Gemini'
        });
    }
};

const handleWebhook = async (req, res) => {
    let filePath;
    try {
        const payload = req.body;
        const timestamp = new Date().toISOString();
        res.status(200).json({ success: true });
        console.log('Call Recording Webhook Received:', payload.call_id);

        // 1. Log payload to file (as requested originally for backup)
        const logEntry = `[${timestamp}] WEBHOOK RECEIVED: ${JSON.stringify(payload, null, 2)}\n---\n`;
        // const logPath = path.join(__dirname, '../../../../call_webhooks.log');
        // fs.appendFileSync(logPath, logEntry);

        // 2. Process only if it's an answered call with a recording
        if (payload.call_status === 'answered' && payload.recording_url) {
            console.log(`Processing answered call: ${payload.call_id}`);

            // Download recording
            filePath = await callRecordingService.downloadRecording(payload.recording_url);

            // Process with Gemini
            console.log(`Analyzing audio with Gemini...`);
            const analysis = await callRecordingService.processAudioWithGemini(filePath);

            // 3. Insert into Database
            await db('call_recordings').insert({
                call_id: payload.call_id,
                customer_mobile_number: payload.caller_id_number,
                recording_url: payload.recording_url,
                call_category: analysis.call_category,
                call_status: analysis.call_status,
                problem_inquiry: Array.isArray(analysis.call_summary?.problem_inquiry)
                    ? analysis.call_summary.problem_inquiry.join('\n')
                    : JSON.stringify(analysis.call_summary?.problem_inquiry),
                solution_response: Array.isArray(analysis.call_summary?.solution_response)
                    ? analysis.call_summary.solution_response.join('\n')
                    : JSON.stringify(analysis.call_summary?.solution_response),
                transcription: analysis.transcription,
                start_stamp: payload.start_stamp,
                end_stamp: payload.end_stamp,
                agent_name: payload.answered_agent_name,
                agent_number: payload.answered_agent_number,
                did_number: payload.call_to_number,
                duration: payload.duration,
                direction: payload.direction,
                raw_payload: JSON.stringify(payload)
            });

            console.log(`Successfully processed and stored call: ${payload.call_id}`);
        } else {
            console.log(`Skipping webhook: Call status is ${payload.call_status} or recording_url missing.`);
        }

        // Clean up
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        res.status(200).json({
            status: 'success',
            message: 'Webhook processed successfully'
        });
    } catch (error) {
        console.error('Error in handleWebhook controller:', error.message);

        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        res.status(500).json({
            status: 'error',
            message: error.message || 'Internal server error while processing webhook'
        });
    }
};

module.exports = {
    processRecording,
    listRecordings,
    processRecordingGemini,
    handleWebhook
};
