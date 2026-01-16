const net = require('net');
const mysql = require('mysql2');
require('dotenv').config();

const PROXY_PORT = process.env.PROXY_PORT || 3306;
const DB_HOST = process.env.DB_HOST;
const DB_PORT = process.env.DB_PORT || 25060;

console.log(`Starting MySQL Proxy Server...`);
console.log(`Proxy listening on port: ${PROXY_PORT}`);
console.log(`Forwarding to: ${DB_HOST}:${DB_PORT}`);

const server = net.createServer((clientSocket) => {
    console.log(`[${new Date().toISOString()}] Client connected from ${clientSocket.remoteAddress}`);

    // Create connection to actual MySQL database
    const dbSocket = net.createConnection({
        host: DB_HOST,
        port: DB_PORT
    }, () => {
        console.log(`[${new Date().toISOString()}] Connected to MySQL database`);
    });

    // Pipe data between client and database
    clientSocket.pipe(dbSocket);
    dbSocket.pipe(clientSocket);

    // Handle errors
    clientSocket.on('error', (err) => {
        console.error(`[${new Date().toISOString()}] Client socket error:`, err.message);
        dbSocket.destroy();
    });

    dbSocket.on('error', (err) => {
        console.error(`[${new Date().toISOString()}] Database socket error:`, err.message);
        clientSocket.destroy();
    });

    // Handle disconnections
    clientSocket.on('close', () => {
        console.log(`[${new Date().toISOString()}] Client disconnected`);
        dbSocket.destroy();
    });

    dbSocket.on('close', () => {
        console.log(`[${new Date().toISOString()}] Database connection closed`);
        clientSocket.destroy();
    });
});

server.on('error', (err) => {
    console.error('Server error:', err);
    process.exit(1);
});

server.listen(PROXY_PORT, '0.0.0.0', () => {
    console.log(`✅ MySQL Proxy Server running on port ${PROXY_PORT}`);
    console.log(`Ready to accept connections...`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing proxy server');
    server.close(() => {
        console.log('Proxy server closed');
        process.exit(0);
    });
});
