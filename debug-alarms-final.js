require('dotenv').config();
const service = require('./src/api/v1/services/omPlatformService');
const axios = require('axios');
const crypto = require('crypto');

async function debug() {
    try {
        const path = '/op/v0/device/list';
        const apiKey = service.apiKey;
        const newlineStyles = [
            { label: 'Double Backslash (\\\\r\\\\n)', val: '\\r\\n' },
            { label: 'Real CRLF (\\r\\n)', val: '\r\n' }
        ];

        for (const style of newlineStyles) {
            console.log(`\n\n>>> Testing Style: ${style.label} <<<`);
            const timestamp = Date.now() - 1000;
            const originals = `${path}${style.val}${apiKey}${style.val}${timestamp}`;
            const signature = crypto.createHash('md5').update(originals).digest('hex').toLowerCase();

            const headers = {
                token: apiKey,
                timestamp: timestamp.toString(),
                signature: signature,
                lang: 'en',
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            };

            const body = { pageSize: 1, pageIndex: 1 };

            try {
                const res = await axios.post(service.url + path, body, { headers });
                console.log(`Status: ${res.status}, Errno: ${res.data?.errno}`);
            } catch (e) {
                console.log(`ERROR: ${e.message}`);
            }
        }
        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

debug();
