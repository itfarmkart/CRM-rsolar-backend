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
    const payload = req.body;
    const timestamp = new Date().toISOString();

    console.log('Call Recording Webhook Received:', payload.call_id || 'unidentified');

    // 1. Send immediate response to Smartflo to avoid timeout
    res.status(200).json({
        status: 'success',
        message: 'Webhook received, processing in background'
    });

    // 2. Perform heavy processing in the background
    // Note: On Vercel, the function might be terminated shortly after the response is sent.
    // For reliable background processing, a queue or Vercel background functions are usually needed,
    // but this approach avoids the immediate Smartflo timeout.
    (async () => {
        let filePath;
        try {
            // Log payload to file if needed (currently commented out as per user's preference)
            // const logEntry = `[${timestamp}] WEBHOOK RECEIVED: ${JSON.stringify(payload, null, 2)}\n---\n`;
            // const logPath = path.join(__dirname, '../../../../call_webhooks.log');
            // fs.appendFileSync(logPath, logEntry);

            if (payload.call_status === 'answered' && payload.recording_url) {
                console.log(`[Background] Processing answered call: ${payload.call_id}`);

                filePath = await callRecordingService.downloadRecording(payload.recording_url);

                console.log(`[Background] Analyzing audio with Gemini...`);
                const analysis = await callRecordingService.processAudioWithGemini(filePath);

                console.log(`[Background] Storing results in Database...`);
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

                console.log(`[Background] Successfully processed and stored call: ${payload.call_id}`);
            } else {
                console.log(`[Background] Skipping: Call status is ${payload.call_status} or recording_url missing.`);
            }
        } catch (error) {
            console.error('[Background Error] Error in handleWebhook background process:', error.message);
        } finally {
            if (filePath && fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
    })();
};

module.exports = {
    processRecording,
    listRecordings,
    processRecordingGemini,
    handleWebhook
};
