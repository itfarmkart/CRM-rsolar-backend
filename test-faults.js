require('dotenv').config();
const OMPlatformService = require('./src/api/v1/services/omPlatformService');
const service = new OMPlatformService();

async function test() {
    try {
        const deviceSN = 'SH1060G1222045';
        console.log(`Testing getSiteDetail for ${deviceSN}...`);
        const result = await service.getSiteDetail(deviceSN);
        console.log('Result Fault Info:', JSON.stringify(result.faultInfo, null, 2));
        process.exit(0);
    } catch (error) {
        console.error('Test failed:', error);
        process.exit(1);
    }
}

test();
