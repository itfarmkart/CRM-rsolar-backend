const axios = require('axios');
require('dotenv').config();

const testProcessRecording = async () => {
    const apiEndpoint = 'http://localhost:4000/api/v1/call-recordings/process';

    // Replace with a real call_id from your Smartflo portal for a real test
    // Or providing a direct audio URL if available
    const testData = {
        // call_id: 'YOUR_REAL_CALL_ID', 
        recording_url: 'https://www.learningcontainer.com/wp-content/uploads/2020/02/Sample-OGG-File.ogg' // Using a public sample for testing
    };

    console.log('Testing Call Recording API...');
    try {
        const response = await axios.post(apiEndpoint, testData);
        console.log('Response Status:', response.status);
        console.log('Analysis Result:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('Test Failed:', error.response ? error.response.data : error.message);
    }
};

// Check if server is running before testing
testProcessRecording();
