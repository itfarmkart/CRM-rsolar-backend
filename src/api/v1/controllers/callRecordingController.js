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

const processPending = async (req, res) => {
    try {
        console.log(`[Queue] Starting process-pending task...`);

        // 1. Fetch pending records (limit to small batch to avoid timeouts)
        const pendingCalls = await db('call_recordings')
            .where('processing_status', 'pending')
            .limit(5);

        if (pendingCalls.length === 0) {
            console.log(`[Queue] No pending calls found.`);
            return res.status(200).json({ status: 'success', message: 'No pending calls' });
        }

        console.log(`[Queue] Found ${pendingCalls.length} pending calls to process.`);

        for (const call of pendingCalls) {
            let filePath;
            try {
                // Mark as processing
                await db('call_recordings')
                    .where('id', call.id)
                    .update({ processing_status: 'processing', last_processed_at: new Date() });

                console.log(`[Queue] Processing call_id: ${call.call_id}`);

                // 2. Download Recording (use aggressive polling)
                filePath = await callRecordingService.downloadRecording(call.recording_url, 15, 3000);

                // 3. Analyze with Gemini
                console.log(`[Queue] Analyzing audio for ${call.call_id}...`);
                const analysis = await callRecordingService.processAudioWithGemini(filePath);

                // 4. Update Database
                await db('call_recordings')
                    .where('id', call.id)
                    .update({
                        call_category: analysis.call_category,
                        problem_inquiry: Array.isArray(analysis.call_summary?.problem_inquiry)
                            ? analysis.call_summary.problem_inquiry.join('\n')
                            : JSON.stringify(analysis.call_summary?.problem_inquiry),
                        solution_response: Array.isArray(analysis.call_summary?.solution_response)
                            ? analysis.call_summary.solution_response.join('\n')
                            : JSON.stringify(analysis.call_summary?.solution_response),
                        transcription: analysis.transcription,
                        processing_status: 'completed',
                        call_status: analysis.call_status
                    });

                console.log(`[Queue] Successfully processed call_id: ${call.call_id}`);

            } catch (error) {
                console.error(`[Queue Error] Failed to process ${call.call_id}:`, error.message);

                await db('call_recordings')
                    .where('id', call.id)
                    .update({
                        processing_status: 'failed',
                        error_log: error.message
                    });
            } finally {
                // Clean up
                if (filePath && fs.existsSync(filePath)) {
                    try { fs.unlinkSync(filePath); } catch (e) { }
                }
            }
        }

        return res.status(200).json({
            status: 'success',
            message: `Processed ${pendingCalls.length} calls`
        });

    } catch (error) {
        console.error('[Queue Error] Critical failure:', error.message);
        return res.status(500).json({ status: 'error', message: error.message });
    }
};

const handleWebhook = async (req, res) => {
    try {
        // 1. LOG IMMEDIATELY (For Vercel Connectivity Debugging)
        console.log(`[Webhook] HIT RECEIVED | Method: ${req.method} | Original-URL: ${req.url}`);

        // Combine body and query to support both POST and GET verification hits
        const payload = req.method === 'POST' ? req.body : req.query;

        if (!payload || Object.keys(payload).length === 0) {
            console.warn(`[Webhook] Empty payload or GET heartbeat detected. Payload:`, JSON.stringify(payload));
            return res.status(200).json({ status: 'ignored', message: 'Heartbeat or empty payload' });
        }

        console.log(`[Webhook] Payload Data:`, JSON.stringify(payload));

        // 2. DIRECTION-AWARE NUMBER EXTRACTION
        // Inbound: caller_id_number is the customer
        // Outbound: call_to_number is the customer
        const direction = (payload.direction || 'inbound').toLowerCase();
        const customerMobile = direction === 'inbound'
            ? payload.caller_id_number
            : payload.call_to_number;

        console.log(`[Webhook] Processing ${direction} call. Customer Mobile: ${customerMobile} | Call ID: ${payload.call_id}`);

        // 3. FAST-SKIP FOR NON-ANSWERED
        if (payload.call_status !== 'answered') {
            console.log(`[Webhook] Skipping call_id ${payload.call_id} because status is: ${payload.call_status}`);
            return res.status(200).json({ status: 'skipped', message: `Call status is ${payload.call_status}` });
        }

        // 4. DATABASE UPDATES (Run in try-catch to ensure we still respond to Smartflo)
        try {
            // Check customer existence
            let customerExist = 0;
            if (customerMobile) {
                const customer = await db('customerDetails')
                    .where('mobileNumber', 'like', `%${customerMobile}%`)
                    .first();
                customerExist = customer ? 1 : 0;
            }

            // Determine processing status (wait for URL if not present)
            const processingStatus = payload.recording_url ? 'pending' : 'waiting_for_url';

            const dbPayload = {
                call_id: payload.call_id,
                customer_mobile_number: customerMobile,
                recording_url: payload.recording_url || null,
                call_status: payload.call_status,
                start_stamp: payload.start_stamp,
                end_stamp: payload.end_stamp,
                agent_name: payload.answered_agent_name,
                agent_number: payload.answered_agent_number,
                did_number: payload.call_to_number,
                duration: payload.duration,
                direction: direction,
                // raw_payload: JSON.stringify(payload), // Commented out per user's previous preference
                processing_status: processingStatus,
                customerExist: customerExist
            };

            await db('call_recordings')
                .insert(dbPayload)
                .onConflict('call_id')
                .merge();

            console.log(`[Webhook] DB Success for ${payload.call_id} | Status: ${processingStatus}`);

        } catch (dbError) {
            console.error(`[Webhook] Database operation failed for ${payload.call_id}:`, dbError.message);
            // We still proceed to return 200 to the provider
        }

        // 5. IMMEDIATE SUCCESS RESPONSE
        return res.status(200).json({
            status: 'success',
            message: 'Webhook processed',
            call_id: payload.call_id
        });

    } catch (error) {
        console.error('[Webhook] Critical Error:', error.message);
        // Always return 200 OK to prevent Smartflo retries flooding the server
        return res.status(200).json({ status: 'error', message: 'Internal error logged' });
    }
};

const getRecordingsByMobile = async (req, res) => {
    try {
        const { mobile_number } = req.params;

        if (!mobile_number) {
            return res.status(400).json({ status: 'error', message: 'Mobile number is required' });
        }

        console.log(`[API] Fetching recordings for mobile: ${mobile_number}`);

        const recordings = await db('call_recordings')
            .where('customer_mobile_number', 'like', `%${mobile_number}%`)
            .where('processing_status', 'completed')
            .orderBy('start_stamp', 'desc');

        return res.status(200).json({
            status: 'success',
            count: recordings.length,
            data: recordings
        });
    } catch (error) {
        console.error('[API Error] getRecordingsByMobile:', error.message);
        return res.status(500).json({
            status: 'error',
            message: 'Internal server error while fetching recordings'
        });
    }
};

module.exports = {
    processRecording,
    listRecordings,
    processRecordingGemini,
    handleWebhook,
    processPending,
    getRecordingsByMobile
};
