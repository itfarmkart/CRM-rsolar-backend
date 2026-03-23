const zohoService = require('./src/api/v1/services/zohoService');
require('dotenv').config();

async function runBulkSync() {
    try {
        console.log('🚀 Starting One-Time Bulk Sync...');
        const result = await zohoService.syncBulkZohoData();
        console.log('✅ Bulk Sync Completed Successfully!');
        console.log('Summary:', JSON.stringify(result, null, 2));
        process.exit(0);
    } catch (error) {
        console.error('❌ Bulk Sync Failed:', error.message);
        process.exit(1);
    }
}

runBulkSync();
