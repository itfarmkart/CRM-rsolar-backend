const axios = require('axios');
const crypto = require('crypto');

const url = 'https://www.foxesscloud.com';
const apiKey = 'fed5a7a7-5291-46cc-a55a-b637d525fe3b';
const deviceSN = 'SYS119118131354';

function getHeaders(path) {
    const timestamp = Date.now();
    const originals = path + '\r\n' + apiKey + '\r\n' + timestamp;
    const signature = crypto.createHash('md5').update(originals).digest('hex').toLowerCase();

    return {
        token: apiKey,
        timestamp: timestamp.toString(),
        signature: signature,
        lang: 'en',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
}

async function testEndpoint(name, path, body = {}) {
    const headers = getHeaders(path);
    try {
        const response = await axios.post(url + path, body, { headers });
        console.log(`[${name}] ${path} -> errno: ${response.data.errno}, msg: ${response.data.msg}`);
        return response.data;
    } catch (error) {
        console.log(`[${name}] ${path} -> FAILED: ${error.message}`);
    }
}

async function runComparisons() {
    console.log('--- Testing Working Endpoints (according to user) ---');
    await testEndpoint('Real Time Data', '/op/v0/device/real/query', { sn: deviceSN, variables: ['power'] });
    await testEndpoint('Technical Specs', '/op/v0/device/detail', { sn: deviceSN });

    console.log('\n--- Testing Failing Endpoint ---');
    await testEndpoint('Device List', '/op/v0/device/list', { pageSize: 1, pageIndex: 1 });
}

runComparisons();
