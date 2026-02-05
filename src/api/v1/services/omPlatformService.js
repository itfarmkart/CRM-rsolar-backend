const axios = require('axios');
const crypto = require('crypto');
const db = require('../../../database/db');

class OMPlatformService {
    constructor() {
        this.url = 'https://www.foxesscloud.com';
        this.apiKey = 'fed5a7a7-5291-46cc-a55a-b637d525fe3b';
    }

    /**
     * Generate headers for FoxEss API request
     */
    getHeaders(path) {
        const timestamp = Date.now() - 1000;
        const originals = `${path}\\r\\n${this.apiKey}\\r\\n${timestamp}`;
        const signature = crypto.createHash('md5').update(originals).digest('hex').toLowerCase();

        return {
            token: this.apiKey,
            timestamp: timestamp.toString(),
            signature: signature,
            lang: 'en',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Node.js)'
        };
    }

    /**
     * Fetch summary of all devices from FoxEss
     */
    async getDeviceSummary() {
        const path = '/op/v0/device/list';
        const headers = this.getHeaders(path);

        try {
            const response = await axios.post(this.url + path, { pageSize: 100, pageIndex: 1 }, { headers });

            if (response.data && response.data.result) {
                const total = response.data.result.total || response.data.result.data?.length || 0;
                const devices = response.data.result.data || [];

                let active = 0;
                let inactive = 0;

                devices.forEach(device => {
                    if (device.status === 1 || device.status === '1') {
                        active++;
                    } else {
                        inactive++;
                    }
                });

                return {
                    total,
                    active,
                    inactive
                };
            }
            return { total: 0, active: 0, inactive: 0 };
        } catch (error) {
            console.error('FoxEss Summary API Error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Fetch devices mapped to customers with pagination and filtering
     */
    async getOMDevices(params) {
        const { search, status, limit = 10, offset = 0 } = params;

        // 1. Fetch customers with solar_device_id from DB
        let query = db('customerDetails as c')
            .whereNotNull('c.solar_device_id')
            .andWhere('c.solar_device_id', '<>', '')
            .select('c.customerId', 'c.customerName', 'c.mobileNumber', 'c.district', 'c.solar_device_id');

        if (search) {
            query = query.where(function () {
                this.where('c.customerName', 'like', `%${search}%`)
                    .orWhere('c.mobileNumber', 'like', `%${search}%`)
                    .orWhere('c.solar_device_id', 'like', `%${search}%`);
            });
        }

        // Clone for count before limit/offset
        const totalCountResult = await query.clone().clearSelect().count('c.customerId as total').first();
        const totalCustomers = totalCountResult ? totalCountResult.total : 0;

        const customers = await query.limit(parseInt(limit)).offset(parseInt(offset)).orderBy('c.customerName', 'asc');

        if (customers.length === 0) {
            return { data: [], total: 0 };
        }

        // 2. Fetch all devices from FoxEss to get status and last sync
        const path = '/op/v0/device/list';
        const headers = this.getHeaders(path);

        let foxDevices = [];
        try {
            // Fetch a larger page to cover most devices, or we might need to loop if many devices
            const response = await axios.post(this.url + path, { pageSize: 100, pageIndex: 1 }, { headers });
            foxDevices = response.data?.result?.data || [];
        } catch (error) {
            console.error('FoxEss List API Error:', error.response?.data || error.message);
        }

        // 3. Map customer data with FoxEss device data
        let mappedDevices = customers.map(customer => {
            const device = foxDevices.find(d => d.sn === customer.solar_device_id);
            return {
                siteId: customer.solar_device_id,
                customerName: customer.customerName,
                mobileNumber: customer.mobileNumber,
                district: customer.district,
                status: device ? (device.status === 1 || device.status === '1' ? 'Active' : 'Inactive') : 'Unknown',
                generationHealth: device ? (device.status === 1 || device.status === '1' ? 'Optimal' : 'Offline') : 'Offline',
                lastSync: device ? device.lastSeen : 'Never', // FoxEss 'lastSeen' is usually the sync time
                financialStatus: 'Paid' // Placeholder as per screenshot, would need more DB lookups
            };
        });

        // 4. Client-side filter for status (since FoxEss data isn't in DB)
        if (status) {
            mappedDevices = mappedDevices.filter(d => d.status.toLowerCase() === status.toLowerCase());
        }

        return {
            data: mappedDevices,
            total: totalCustomers
        };
    }
}

module.exports = new OMPlatformService();
