const fs = require('fs');
const zohoService = require('./src/api/v1/services/zohoService');
require('dotenv').config();

const logFile = 'bulk_sync_final.log';
fs.writeFileSync(logFile, `🚀 Starting Sync at ${new Date().toISOString()}\n`);

// Override console.log to write to file
const originalLog = console.log;
const originalError = console.error;

console.log = (...args) => {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
    fs.appendFileSync(logFile, `[LOG] ${msg}\n`);
    originalLog(...args);
};

console.error = (...args) => {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
    fs.appendFileSync(logFile, `[ERR] ${msg}\n`);
    originalError(...args);
};

async function run() {
    try {
        const isFull = process.argv.includes('--full');
        const result = await zohoService.syncBulkZohoData({ full: isFull });
        console.log('✅ Bulk Sync Finished!');
        console.log('Result:', result);
        process.exit(0);
    } catch (err) {
        console.error('❌ Bulk Sync Crash:', err.message);
        process.exit(1);
    }
}

run();
