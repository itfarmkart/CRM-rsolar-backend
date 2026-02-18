require('dotenv').config();
const service = require('./src/api/v1/services/omPlatformService');
const axios = require('axios');

async function run() {
    const sn = 'SYS119118131306';
    const now = Date.now();
    const tenDaysAgo = now - (10 * 24 * 60 * 60 * 1000);

    const endpoints = [
        { path: '/op/v0/device/event/list', body: { sn, begin: tenDaysAgo, end: now, currentPage: 1, pageSize: 50 } },
        { path: '/op/v0/message/list', body: { type: 1, currentPage: 1, pageSize: 50 } },
        { path: '/op/v0/alarm/list', body: { sn, currentPage: 1, pageSize: 50 } }
    ];

    for (const ep of endpoints) {
        console.log(`\n==========================================`);
        console.log(`TESTING ENDPOINT: ${ep.path}`);
        console.log(`Payload: ${JSON.stringify(ep.body)}`);

        try {
            const headers = service.getHeaders(ep.path);
            const response = await axios.post(service.url + ep.path, ep.body, { headers });
            console.log(`RESPONSE STATUS: ${response.status}`);
            console.log(`RESPONSE DATA: ${JSON.stringify(response.data, null, 2)}`);
        } catch (error) {
            console.error(`!!!! ERROR for ${ep.path} !!!!`);
            console.error(`Message: ${error.message}`);
            if (error.response) {
                console.error(`Status: ${error.response.status}`);
                console.error(`Data: ${JSON.stringify(error.response.data)}`);
            }
        }
    }
    process.exit(0);
}

run();
