const db = require('./src/database/db');
const fs = require('fs');

async function checkColumns(tableName) {
    try {
        const columns = await db(tableName).columnInfo();
        return { [tableName]: Object.keys(columns) };
    } catch (error) {
        return { [tableName]: error.message };
    }
}

async function run() {
    const result = await checkColumns('customerDetails');
    fs.writeFileSync('schema_customer.json', JSON.stringify(result, null, 2));
    process.exit(0);
}

run();
