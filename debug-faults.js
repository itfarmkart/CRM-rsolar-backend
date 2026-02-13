require('dotenv').config();
const OMPlatformService = require('./src/api/v1/services/omPlatformService');
const db = require('./src/database/db');
const service = new OMPlatformService();

async function findFaultyDevice() {
    try {
        const devices = await db('customerDetails').whereNotNull('solar_device_id').select('solar_device_id').limit(20);
        console.log(`Checking ${devices.length} devices...`);

        for (const dev of devices) {
            const sn = dev.solar_device_id;
            console.log(`Checking ${sn}...`);
            const specs = await service.getDeviceTechnicalSpecs(sn);
            console.log(`Status for ${sn}: ${specs.status}`);

            if (specs.status == 2 || specs.status == '2') {
                console.log(`FOUND FAULTY DEVICE: ${sn}`);
                const realTime = await service.getDeviceRealTimeData(sn);
                console.log('RealTime Data:', JSON.stringify(realTime, null, 2));
                const faults = await service.getDeviceFaults(sn);
                console.log('Faults Dictionary Sample:', JSON.stringify(faults).substring(0, 500));

                // Test the extraction logic
                const codes = service.extractActiveFaultCodes(realTime);
                console.log('Extracted Codes:', codes);
                break;
            }
        }
        process.exit(0);
    } catch (error) {
        console.error('Scan failed with error:');
        console.error(error.stack || error);
        process.exit(1);
    }
}

findFaultyDevice();
