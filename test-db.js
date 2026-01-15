const db = require('./src/database/db');

async function testConnection() {
    try {
        console.log('Testing database connection...');
        const result = await db.raw('SELECT 1+1 AS result');
        console.log('Database connection successful:', result[0][0]);

        const [tables] = await db.raw('SHOW TABLES');
        console.log('Tables in database:', tables.map(t => Object.values(t)[0]));

        process.exit(0);
    } catch (error) {
        console.error('Database connection failed:');
        console.error(error);
        process.exit(1);
    }
}

testConnection();
