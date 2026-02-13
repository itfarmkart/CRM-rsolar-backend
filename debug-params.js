const axios = require('axios');
const crypto = require('crypto');

const url = 'https://www.foxesscloud.com';
const apiKey = 'fed5a7a7-5291-46cc-a55a-b637d525fe3b';
const path = '/op/v0/device/list';

async function test(name, newline, body) {
    const timestamp = Date.now();
    const originals = path + newline + apiKey + newline + timestamp;
    const signature = crypto.createHash('md5').update(originals).digest('hex').toLowerCase();

    const headers = {
        token: apiKey,
        timestamp: timestamp.toString(),
        signature: signature,
        lang: 'en',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    try {
        const response = await axios.post(url + path, body, { headers });
        console.log(`[${name}] NL: ${JSON.stringify(newline)}, Body: ${JSON.stringify(body)} -> errno: ${response.data.errno}, msg: ${response.data.msg}`);
        if (response.data.errno === 0) {
            console.log('--- SUCCESS! --- Count:', response.data.result?.total);
        }
    } catch (error) {
        console.log(`[${name}] FAILED: ${error.message}`);
    }
}

async function run() {
    console.log('Testing variations for /op/v0/device/list...');
    await test('Standard CRLF', '\r\n', { pageSize: 1, pageIndex: 1 });
    await test('Standard LF', '\n', { pageSize: 1, pageIndex: 1 });
    await test('CurrentPage CRLF', '\r\n', { pageSize: 1, currentPage: 1 });
    await test('CurrentPage LF', '\n', { pageSize: 1, currentPage: 1 });
}

run();
