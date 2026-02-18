require('dotenv').config();
const service = require('./src/api/v1/services/omPlatformService');
const db = require('./src/database/db');

async function scan() {
    try {
        console.log('>>> Identifying Sites with Events <<<');

        // 1. Get all customer device IDs from DB directly to be fast
        const customers = await db('customerDetails')
            .whereNotNull('solar_device_id')
            .select('solar_device_id', 'customerName', 'customerId');

        console.log(`Scanning ${customers.length} sites...`);
        const activeSites = [];

        for (const c of customers) {
            try {
                // Check local updates first (fast)
                const localUpdates = await db('complaintUpdates as cu')
                    .join('complaints as cp', 'cu.complaint_id', 'cp.id')
                    .where('cp.customerId', c.customerId)
                    .count('cu.id as count')
                    .first();

                // Check FoxESS alarms (requires API call)
                const alarms = await service.getDeviceAlarms(c.solar_device_id);

                const totalEvents = parseInt(localUpdates?.count || 0) + alarms.length;

                if (totalEvents > 0) {
                    activeSites.push({
                        sn: c.solar_device_id,
                        name: c.customerName,
                        local: localUpdates?.count || 0,
                        alarms: alarms.length
                    });
                    console.log(`FOUND: ${c.solar_device_id} | Name: ${c.customerName} | Alarms: ${alarms.length} | Local: ${localUpdates?.count || 0}`);
                }
            } catch (err) {
                console.error(`Error scanning ${c.solar_device_id}:`, err.message);
            }
        }

        console.log('\n--- FINAL SUMMARY ---');
        if (activeSites.length === 0) {
            console.log('No sites found with any events.');
        } else {
            console.log(`Found ${activeSites.length} sites with events:`);
            activeSites.forEach(s => {
                console.log(` + ${s.sn} (${s.name}): Total ${parseInt(s.local) + s.alarms} events (${s.alarms} alarms, ${s.local} updates)`);
            });
        }

        process.exit(0);
    } catch (error) {
        console.error('Fatal Error:', error);
        process.exit(1);
    }
}

scan();
