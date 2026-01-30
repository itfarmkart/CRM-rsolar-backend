const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

const v1Routes = require('./api/v1/routes');

const app = express();

// Middleware
// CORS Configuration
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        const allowedOrigins = [
            'http://localhost:4200',
            'http://localhost:3000',
            'http://localhost:4000',
            'http://localhost:8080',
            'http://127.0.0.1:8080'
            // Add your production frontend URL here when deployed
            // 'https://your-frontend-domain.com'
        ];

        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(null, true); // Allow all origins in development
            // In production, you might want to restrict this:
            // callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(morgan('dev'));

// Routes
app.use('/api/v1', v1Routes);

// Temporary Debug Route to find Vercel Outgoing IP
app.get('/api/v1/debug/my-ip', (req, res) => {
    const https = require('https');
    https.get('https://api.ipify.org?format=json', (resp) => {
        let data = '';
        resp.on('data', (chunk) => { data += chunk; });
        resp.on('end', () => {
            try {
                const json = JSON.parse(data);
                res.json({
                    message: "This is the IP you need to whitelist (TEMPORARILY) on DigitalOcean",
                    vercel_outgoing_ip: json.ip,
                    note: "Warning: This IP will change on your next deployment or restart."
                });
            } catch (err) {
                res.status(500).json({ error: "Failed to parse IP data" });
            }
        });
    }).on("error", (err) => {
        res.status(500).json({ error: err.message });
    });
});

// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        status: 'error',
        message: 'Something went wrong!'
    });
});

module.exports = app;
