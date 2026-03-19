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
    const deliveryCols = await checkColumns('Delivery');
    const handoverCols = await checkColumns('handover');
    const result = { ...deliveryCols, ...handoverCols };
    fs.writeFileSync('schema_output.json', JSON.stringify(result, null, 2));
    process.exit(0);
}

run();
