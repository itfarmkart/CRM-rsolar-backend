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
        'User-Agent': 'Mozilla/5.0 (Node.js)'
    };
}

async function run() {
    console.log('--- Testing Alarms (Path: /op/v0/alarm/list) ---');
    const pathAlarm = '/op/v0/alarm/list';
    const bodyAlarm = { sn: deviceSN, pageSize: 1, pageIndex: 1 };
    try {
        const resp = await axios.post(url + pathAlarm, bodyAlarm, { headers: getHeaders(pathAlarm) });
        console.log('Alarm Result errno:', resp.data.errno);
    } catch (e) { console.log('Alarm FAILED:', e.message); }

    console.log('\n--- Testing List (Path: /op/v0/device/list) ---');
    const pathList = '/op/v0/device/list';
    const bodyList = { pageSize: 1, pageIndex: 1 };
    try {
        const resp = await axios.post(url + pathList, bodyList, { headers: getHeaders(pathList) });
        console.log('List Result errno:', resp.data.errno);
    } catch (e) { console.log('List FAILED:', e.message); }
}

run();
