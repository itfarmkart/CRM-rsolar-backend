const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const os = require('os');
require('dotenv').config();

const CLOUDPHONE_API_TOKEN = process.env.CLOUDPHONE_API_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

/**
 * Fetches all call detail records.
 * @param {Object} queryParams 
 * @returns {Promise<Array>} list of call records
 */
const getAllRecordings = async (queryParams = {}) => {
    try {
        const response = await axios.get(`https://api-smartflo.tatateleservices.com/v1/call/records`, {
            params: {
                limit: queryParams.limit || 50,
                page: queryParams.page || 1,
                ...queryParams
            },
            headers: { 'Authorization': `Bearer ${CLOUDPHONE_API_TOKEN}` }
        });
        console.log('response', response.data);

        if (response && response.data) {
            return response.data;
        }
        return [];
    } catch (error) {
        console.error('Error fetching all recordings:', error.message);
        throw error;
    }
};

/**
 * Fetches call detail record to get the recording URL.
 * @param {string} callId 
 * @returns {Promise<string>} recording_url
 */
const getRecordingUrl = async (callId) => {
    try {
        const response = await axios.get(`https://api-smartflo.tatateleservices.com/v1/call/records`, {
            params: { call_id: callId },
            headers: { 'Authorization': `Bearer ${CLOUDPHONE_API_TOKEN}` }
        });
        console.log('response getRecordingUrl', response.data);
        if (response.data && response.data.results.length > 0) {
            const record = response.data.results[0];
            console.log('record', record.recording_url);
            return record.recording_url;
        }
        throw new Error('No recording URL found for the provided call ID');
    } catch (error) {
        console.error('Error fetching recording URL:', error.message);
        throw error;
    }
};

/**
 * Downloads the recording file with retry logic for 404 errors.
 * @param {string} url 
 * @param {number} retries Number of retries (default 6)
 * @param {number} delay Delay between retries in ms (default 8000)
 * @returns {Promise<string>} local file path
 */
const downloadRecording = async (url, retries = 6, delay = 8000) => {
    let lastError;

    console.log(`[Download] Starting download from: ${url}`);

    for (let i = 0; i <= retries; i++) {
        try {
            if (i > 0) {
                console.log(`[Download] Attempt ${i + 1}/${retries + 1}: Waiting ${delay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }

            const extension = path.extname(url.split('?')[0]) || '.mp3';
            const fileName = `recording_${Date.now()}${extension}`;
            const filePath = path.join(os.tmpdir(), fileName);

            const writer = fs.createWriteStream(filePath);

            const response = await axios({
                url,
                method: 'GET',
                responseType: 'stream',
                timeout: 30000 // 30s timeout for download
            });

            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            console.log(`[Download] Successfully downloaded recording on attempt ${i + 1}`);
            return filePath;
        } catch (error) {
            lastError = error;
            const status = error.response ? error.response.status : null;
            console.error(`[Download] Attempt ${i + 1} failed: ${status || error.message}`);

            // If it's not a 404 or 429, we might not want to retry, 
            // but for Smartflo, 404 is the common "not ready yet" error.
            if (status !== 404 && status !== 500 && status !== 502) {
                break;
            }
        }
    }

    throw lastError;
};

/**
 * Transcribes audio via OpenAI Whisper.
 * @param {string} filePath 
 * @returns {Promise<string>} transcription text
 */
const transcribeAudio = async (filePath) => {
    try {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(filePath));
        formData.append('model', 'whisper-1');
        // Providing a prompt helps Whisper with specific vocabulary and regional accents
        formData.append('prompt', 'Farmkart, Rsolar, solar panel, inverter, subsidy, GEDA, installation, billing, service request, technical issue. The conversation is in an Indian context, possibly involving Indian English or regional accents.');

        const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
            headers: {
                ...formData.getHeaders(),
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            }
        });

        return response.data.text;
    } catch (error) {
        console.error('Error transcribing audio:', error.response ? error.response.data : error.message);
        throw error;
    }
};

/**
 * Summarizes and categorizes transcription via OpenAI GPT.
 * @param {string} transcription 
 * @returns {Promise<Object>} { bulletPoints, category }
 */
const summarizeAndCategorize = async (transcription) => {
    try {
        const prompt = `
        Analyze the following call transcription which is from an Indian regional context:
        """
        ${transcription}
        """
        
        The conversation might involve Indian English, Hindi, or a mix of both (Hinglish). Please interpret the context accurately, accounting for regional conversational styles.
        
        Provide the following:
        1. A bulleted summary of the conversation.
        2. The purpose of the call (represented as "category", e.g., Sales, Support, Technical Issue, Billing, etc.).
        
        Format the response as a JSON object with keys "bulletPoints" (an array) and "category" (a string).
        `;

        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' }
        }, {
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        return JSON.parse(response.data.choices[0].message.content);
    } catch (error) {
        console.error('Error summarizing transcription:', error.message);
        throw error;
    }
};

/**
 * Processes audio natively using GPT-4o Audio for higher accuracy.
 * Transcribes, summarizes, and categorizes in one step.
 * @param {string} filePath 
 * @returns {Promise<Object>} { transcription, bulletPoints, category }
 */
const processAudioWithGPT4o = async (filePath) => {
    try {
        const audioBuffer = fs.readFileSync(filePath);
        const base64Audio = audioBuffer.toString('base64');
        const extension = path.extname(filePath).toLowerCase().replace('.', '');
        const format = extension === 'mp3' ? 'mp3' : 'wav';

        const prompt = `
        You are an expert audio analyst. Listen to the attached call recording which is from an Indian regional context.
        The conversation might involve Indian English, Hindi, or a mix of both (Hinglish).
        
        Provide the following in JSON format:
        1. "transcription": The full verbatim transcription of the call.
        2. "bulletPoints": A concise bulleted summary of the key points discussed.
        3. "category": The primary purpose of the call (e.g., Sales, Support, Technical Issue, Billing, etc.).
        
        Ensure the transcription correctly captures regional terms like "Farmkart", "Rsolar", "GEDA", "subsidy", etc.
        `;

        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-audio-preview',
            modalities: ["text"],
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        {
                            type: 'input_audio',
                            data: base64Audio,
                            format: format
                        }
                    ]
                }
            ],
            response_format: { type: 'json_object' }
        }, {
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const result = JSON.parse(response.data.choices[0].message.content);
        return result;
    } catch (error) {
        console.error('Error in processAudioWithGPT4o:', error.response ? JSON.stringify(error.response.data) : error.message);
        throw error;
    }
};

/**
 * Processes audio natively using Gemini 1.5 for higher accuracy.
 * Transcribes, summarizes, and categorizes in one step.
 * @param {string} filePath 
 * @returns {Promise<Object>} { transcription, bulletPoints, category }
 */
const processAudioWithGemini = async (filePath) => {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const audioData = fs.readFileSync(filePath);
        const base64Audio = audioData.toString('base64');
        const mimeType = path.extname(filePath).toLowerCase() === '.mp3' ? 'audio/mpeg' : 'audio/wav';

        // const prompt = `
        // You are an expert audio analyst. Listen to the attached call recording which is from an Indian regional context.
        // The conversation might involve Indian English, Hindi, or a mix of both (Hinglish).

        // Provide the following in JSON format:
        // 1. "transcription": The full verbatim transcription of the call.
        // 2. "bulletPoints": A concise bulleted summary of the key points discussed.
        // 3. "category": The primary purpose of the call (e.g., Sales, Support, Technical Issue, Billing, etc.).

        // Ensure the transcription correctly captures regional terms like "Farmkart", "Rsolar", "GEDA", "subsidy", etc.
        // Return ONLY the JSON object.
        // `;

        const prompt = `You are an expert audio analyst specializing in the Indian regional context. Listen to the attached call recording (Indian English, Hindi, or Hinglish). 

Provide the analysis in JSON format only, following this structure to match the CRM interface:

1. "call_category": A short classification tag (e.g., Technical Support, Sales Inquiry, Complaint, Billing Enquiry, Product Info).
2. "call_status": A short status tag (e.g., Issue Resolved, Info Provided, Follow-up Needed, Transferred).
3. "transcription": The full verbatim transcription of the call.
4. "call_summary": An object containing two distinct sections:
    - "problem_inquiry": Concise bullet points detailing the customer's specific issue or question.
    - "solution_response": Concise bullet points detailing the agent's actions, explanation, or the resolution provided.

Ensure regional terms like "Farmkart", "Rsolar", "GEDA", and "subsidy" are correctly identified and used in the summary.

Return ONLY the JSON object.`;

        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: base64Audio,
                    mimeType: mimeType
                }
            }
        ]);

        const responseText = result.response.text();
        // Clean markdown code blocks if present
        const jsonString = responseText.replace(/```json\n?|```/g, '').trim();
        return JSON.parse(jsonString);
    } catch (error) {
        console.error('Error in processAudioWithGemini:', error.message);
        throw error;
    }
};

module.exports = {
    getAllRecordings,
    getRecordingUrl,
    downloadRecording,
    transcribeAudio,
    summarizeAndCategorize,
    processAudioWithGPT4o,
    processAudioWithGemini
};
