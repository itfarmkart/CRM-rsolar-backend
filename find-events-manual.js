require('dotenv').config();
const db = require('./src/database/db');

async function check() {
    try {
        const u = await db('customerDetails as c')
            .join('complaints as cp', 'c.customerId', 'cp.customerId')
            .join('complaintUpdates as cu', 'cp.id', 'cu.complaint_id')
            .whereNotNull('c.solar_device_id')
            .andWhere('c.solar_device_id', '<>', '')
            .select('c.solar_device_id', 'c.customerName')
            .groupBy('c.solar_device_id', 'c.customerName');

        console.log('SITES_WITH_LOCAL_EVENTS:', JSON.stringify(u, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
