const db = require('./src/database/db');

async function checkColumns(tableName) {
    try {
        const columns = await db(tableName).columnInfo();
        console.log(`Columns for ${tableName}:`, JSON.stringify(Object.keys(columns), null, 2));
    } catch (error) {
        console.error(`Error checking columns for ${tableName}:`, error.message);
    }
}

async function run() {
    await checkColumns('Delivery');
    await checkColumns('handover');
    process.exit(0);
}

run();
