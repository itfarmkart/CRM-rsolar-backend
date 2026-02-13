const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');

const url = 'https://www.foxesscloud.com';
const apiKey = 'fed5a7a7-5291-46cc-a55a-b637d525fe3b';
const path = '/op/v0/device/list';
const logFile = 'debug-output-order.txt';

fs.writeFileSync(logFile, 'Testing all permutations of signature order...\n');

function getPermutations(arr) {
    if (arr.length <= 1) return [arr];
    let perms = [];
    for (let i = 0; i < arr.length; i++) {
        let rest = getPermutations(arr.slice(0, i).concat(arr.slice(i + 1)));
        for (let r of rest) {
            perms.push([arr[i]].concat(r));
        }
    }
    return perms;
}

async function run() {
    const components = [path, apiKey, '']; // '' will be replaced by timestamp
    const orders = getPermutations(components);
    const newlines = ['\r\n', '\n'];

    for (const order of orders) {
        for (const nl of newlines) {
            const timestamp = Date.now();
            const orderWithTS = order.map(c => c === '' ? timestamp.toString() : c);
            const originals = orderWithTS.join(nl);
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
                const response = await axios.post(url + path, { pageSize: 1, pageIndex: 1 }, { headers });
                const msg = `Order: [${orderWithTS.join(', ')}], NL: ${JSON.stringify(nl)} -> errno: ${response.data.errno}, msg: ${response.data.msg}\n`;
                fs.appendFileSync(logFile, msg);
                if (response.data.errno === 0) {
                    fs.appendFileSync(logFile, '--- FOUND IT! ---\n');
                    console.log('--- FOUND IT! ---');
                    return;
                }
            } catch (error) {
                fs.appendFileSync(logFile, `FAILED: ${error.message}\n`);
            }
        }
    }
    fs.appendFileSync(logFile, 'All order permutations complete.\n');
}

run();
