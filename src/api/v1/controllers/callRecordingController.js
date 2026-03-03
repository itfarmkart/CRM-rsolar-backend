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

        console.log(`[Webhook] Incoming call_id: ${payload.call_id || 'unidentified'}`);
        console.log(`[Webhook] Full Payload:`, JSON.stringify(payload));

        // 1. Process only if it's an answered call with a recording
        if (payload.call_status === 'answered' && payload.recording_url) {
            console.log(`[Webhook] Condition met. Starting processing for: ${payload.call_id}`);

            // Download recording with retry logic
            try {
                console.log(`[Webhook] Attempting to download recording from webhook URL...`);
                filePath = await callRecordingService.downloadRecording(payload.recording_url);
            } catch (downloadErr) {
                console.warn(`[Webhook] Webhook URL failed for ${payload.call_id}. Attempting fallback to fetch fresh URL from API...`);

                // Fallback: Fetch fresh URL from API
                try {
                    const freshUrl = await callRecordingService.getRecordingUrl(payload.call_id);
                    if (freshUrl && freshUrl !== payload.recording_url) {
                        console.log(`[Webhook] Found different URL via API: ${freshUrl}`);
                        filePath = await callRecordingService.downloadRecording(freshUrl);
                    } else {
                        throw new Error('Fresh URL is the same or not found');
                    }
                } catch (fallbackErr) {
                    console.error(`[Webhook] Fallback also failed: ${fallbackErr.message}`);
                    throw downloadErr; // Throw original error if fallback also fails
                }
            }
            console.log(`[Webhook] Final Downloaded Path: ${filePath}`);

            // Process with Gemini
            console.log(`[Webhook] Analyzing audio with Gemini...`);
            const analysis = await callRecordingService.processAudioWithGemini(filePath);
            console.log(`[Webhook] Analysis complete. Category: ${analysis.call_category}`);

            // 2. Insert into Database
            console.log(`[Webhook] Attempting DB insertion...`);
            const dbPayload = {
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
            };

            await db('call_recordings').insert(dbPayload);
            console.log(`[Webhook] Successfully stored in DB: ${payload.call_id}`);

            res.status(200).json({
                status: 'success',
                message: 'Webhook processed and stored successfully',
                call_id: payload.call_id
            });
        } else {
            console.log(`[Webhook] Skipping: status=${payload.call_status}, has_url=${!!payload.recording_url}`);
            res.status(200).json({
                status: 'skipped',
                message: 'Recording not available or call not answered'
            });
        }
    } catch (error) {
        console.error('[Webhook Error] Exception:', error.message);
        console.error('[Webhook Error] Stack:', error.stack);

        res.status(500).json({
            status: 'error',
            message: error.message || 'Internal server error while processing webhook'
        });
    } finally {
        // Clean up temporary files
        if (filePath && fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
                console.log(`[Webhook] Cleaned up temporary file: ${filePath}`);
            } catch (cleanupErr) {
                console.error(`[Webhook] Cleanup failed for ${filePath}:`, cleanupErr.message);
            }
        }
    }
};

module.exports = {
    processRecording,
    listRecordings,
    processRecordingGemini,
    handleWebhook
};
