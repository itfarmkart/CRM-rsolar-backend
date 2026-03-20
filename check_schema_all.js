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
    const tables = [
        "CHCData", "ConvertBooking", "backend_fid", "Site_visit", 
        "backend_main", "NameTransfer", "Banking", "PreInspection", 
        "LoadChange", "WCR"
    ];
    const result = {};
    for (const t of tables) {
        result[t] = await checkColumns(t);
    }
    fs.writeFileSync('schema_output_all.json', JSON.stringify(result, null, 2));
    process.exit(0);
}

run();
