require('dotenv').config();

/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */
module.exports = {
    development: {
        client: 'mysql2',
        connection: {
            host: process.env.DB_HOST,
            port: process.env.DB_PORT || 25060,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            timezone: process.env.DB_TIMEZONE || 'Asia/Kolkata',
            ssl: {
                rejectUnauthorized: false
            }
        },
        migrations: {
            directory: './src/database/migrations'
        },
        seeds: {
            directory: './src/database/seeds'
        }
    },

    production: {
        client: 'mysql2',
        connection: {
            host: process.env.DB_HOST,
            port: process.env.DB_PORT || 25060,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            timezone: process.env.DB_TIMEZONE || 'Asia/Kolkata',
            ssl: {
                rejectUnauthorized: false
            },
            connectTimeout: 60000, // 60 seconds
            acquireConnectionTimeout: 60000
        },
        pool: {
            min: 2,
            max: 10,
            acquireTimeoutMillis: 60000,
            idleTimeoutMillis: 30000
        },
        migrations: {
            directory: './src/database/migrations'
        }
    }
};
