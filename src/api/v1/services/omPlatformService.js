const axios = require('axios');
const crypto = require('crypto');
const db = require('../../../database/db');
const { stat } = require('fs');

class OMPlatformService {
    constructor() {
        this.url = 'https://www.foxesscloud.com';
        this.apiKey = 'fed5a7a7-5291-46cc-a55a-b637d525fe3b';
    }

    /**
     * Generate headers for FoxEss API request
     */
    getHeaders(path) {
        const timestamp = Date.now();
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

            if (response.data && response.data.errno === 0 && response.data.result) {
                console.log('FoxEss Summary API Response:', response.data);
                const total = response.data.result.total || response.data.result.data?.length || 0;
                const devices = response.data.result.data || [];
                const customers = await db('customerDetails as c')
                    .whereNotNull('c.solar_device_id')
                    .andWhere('c.solar_device_id', '<>', '')
                    .select('c.solar_device_id');

                let mappedDevices = customers.map(customer => {
                    return devices.find(d => d.deviceSN === customer.solar_device_id);

                })
                console.log('mappedDevices', mappedDevices[0])

                let active = 0;
                let inactive = 0;

                mappedDevices.forEach(device => {
                    if (device?.status === 1 || device?.status === '1') {
                        active++;
                    } else {
                        inactive++;
                    }
                });
                return {
                    total: mappedDevices.length,
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
        const { search, limit = 10, offset = 0 } = params;
        const statusString = params.status; // User passed 'status' in manual change

        // Map status strings to FoxESS codes
        // 1: Online, 2: Fault, 3: Offline
        let numericStatus = null;
        if (statusString === 'Online') numericStatus = 1;
        else if (statusString === 'Fault') numericStatus = 2;
        else if (statusString === 'Offline') numericStatus = 3;

        // 1. Fetch ALL customers with solar_device_id from DB
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

        const customers = await query.orderBy('c.customerName', 'asc');

        if (customers.length === 0) {
            return { data: [], total: 0 };
        }

        // 2. Fetch devices from FoxEss
        const path = '/op/v0/device/list';
        const headers = this.getHeaders(path);
        let foxDevices = [];
        try {
            // Scale note: Fetching 100 is enough for current 43 sites. 
            const response = await axios.post(this.url + path, { pageSize: 100, pageIndex: 1 }, { headers });
            if (response.data && response.data.errno === 0) {
                foxDevices = response.data.result?.data || [];
            }
        } catch (error) {
            console.error('FoxEss List API Error:', error.response?.data || error.message);
        }

        // 3. Map status and filter
        let mappedDevices = customers.map(customer => {
            const device = foxDevices.find(d =>
                d.deviceSN?.toLowerCase() === customer.solar_device_id?.toLowerCase()
            );

            let statusLabel = 'Offline';
            let devStatus = 3; // Default to Offline
            if (device) {
                devStatus = parseInt(device.status);
                if (devStatus === 1) statusLabel = 'Online';
                else if (devStatus === 2) statusLabel = 'Fault';
                else statusLabel = 'Offline';
            }

            // Apply status filter here
            if (numericStatus && devStatus !== numericStatus) return null;

            return {
                siteId: customer.solar_device_id,
                customerId: customer.customerId,
                customerName: customer.customerName,
                mobileNumber: customer.mobileNumber,
                district: customer.district,
                status: statusLabel,
                generationHealth: statusLabel,
                lastSync: device ? device.lastSync : 'Never',
                financialStatus: 'Paid'
            };
        }).filter(d => d !== null);

        // 4. Apply pagination in memory
        const total = mappedDevices.length;
        const paginatedData = mappedDevices.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

        return {
            data: paginatedData,
            total: total
        };
    }

    /**
     * Fetch real-time data for a specific device
     */
    async getDeviceRealTimeData(deviceSN) {
        const path = '/op/v0/device/real/query';
        const headers = this.getHeaders(path);
        try {
            const response = await axios.post(this.url + path, { sn: deviceSN, variables: [] }, { headers });
            return response.data?.result?.[0]?.datas || [];
        } catch (error) {
            console.error('FoxEss Real-time API Error:', error.response?.data || error.message);
            return [];
        }
    }

    /**
     * Fetch historical variable data
     */
    async getDeviceHistoryPower(deviceSN, begin, end) {
        const path = '/op/v0/device/history/query';
        const headers = this.getHeaders(path);
        try {
            // Query all variables to be safe and find the most relevant power metric
            const response = await axios.post(this.url + path, {
                sn: deviceSN,
                variables: [],
                begin: begin,
                end: end
            }, { headers });

            const result = response.data?.result;
            if (!result || !Array.isArray(result) || result.length === 0) return 0;

            // Look for a suitable power variable in the results
            // Common FoxESS variables: 'power', 'pvPower', 'generationPower', 'loadsPower'
            const preferredVariables = ['generationPower', 'power', 'pvPower', 'loadsPower'];

            for (const varName of preferredVariables) {
                const varData = result.find(v => v.variable === varName);
                if (varData && Array.isArray(varData.datas) && varData.datas.length > 0) {
                    // Get the latest value from the window
                    const latestPoint = varData.datas[varData.datas.length - 1];
                    return parseFloat(latestPoint.value || 0);
                }
            }

            return 0;
        } catch (error) {
            console.error('FoxEss History API Error:', error.response?.data || error.message);
            return 0;
        }
    }

    /**
     * Fetch fault dictionary/list from FoxEss
     */
    async getDeviceFaults(deviceSN) {
        const path = '/op/v0/device/fault/get';
        const headers = this.getHeaders(path);
        try {
            const response = await axios.get(this.url + path, { params: { sn: deviceSN }, headers });
            const result = response.data?.result;
            return Array.isArray(result) ? result : (result ? [result] : []);
        } catch (error) {
            console.error('FoxEss Fault API Error:', error.response?.data || error.message);
            return [];
        }
    }

    /**
     * Fetch alarms/event log for a specific device
     */
    async getDeviceAlarms(deviceSN) {
        const path = '/op/v0/alarm/list';
        const headers = this.getHeaders(path);
        try {
            const response = await axios.post(this.url + path, { sn: deviceSN, currentPage: 1, pageSize: 20 }, { headers });
            console.log(`FoxEss Alarms API Response for ${deviceSN}:`, response.data);
            const result = response.data?.result;
            const data = result?.data || result;
            return Array.isArray(data) ? data : (data ? [data] : []);
        } catch (error) {
            console.error('FoxEss Alarm API Error:', error.response?.data || error.message);
            return [];
        }
    }

    /**
     * Fetch technical specs for a specific device
     */
    async getDeviceTechnicalSpecs(deviceSN) {
        const path = '/op/v0/device/detail';
        const headers = this.getHeaders(path);
        try {
            const response = await axios.get(this.url + path, { params: { sn: deviceSN }, headers });
            return response.data?.result || {};
        } catch (error) {
            console.error('FoxEss Detail API Error:', error.response?.data || error.message);
            return {};
        }
    }

    /**
     * Extract active fault codes from real-time data variables
     * FoxESS faultCode is often a bitset where each bit corresponds to a fault ID
     */
    extractActiveFaultCodes(realTimeData) {
        const activeCodes = [];

        // 1. Check for string-based faults (e.g. currentFault: "No utility")
        const currentFault = realTimeData.find(v => v.variable === 'currentFault');
        if (currentFault && currentFault.value && currentFault.value !== 'No fault' && currentFault.value !== 'Normal') {
            // We treat the string itself as a pseudo-code or handle it separately
            // For mapping purposes, we'll use a special range or just provide a placeholder if translation is needed
            // But if we want to show it, we might need to add it to our dictionary or return it directly
            activeCodes.push(currentFault.value);
        }

        // 2. Check for traditional numeric bit-field faults (faultCode, faultCode1, etc.)
        const faultVars = realTimeData.filter(v =>
            v.variable && (v.variable.toLowerCase().includes('faultcode') || v.variable.toLowerCase().includes('errcode'))
        );

        faultVars.forEach(v => {
            const val = parseInt(v.value);
            if (isNaN(val) || val === 0) return;

            let offset = 0;
            const match = v.variable.match(/\d+/);
            if (match) {
                const index = parseInt(match[0]);
                offset = (index - 1) * 32;
            }

            for (let i = 0; i < 32; i++) {
                if ((val >> i) & 1) {
                    activeCodes.push(offset + i + 1);
                }
            }
        });

        return [...new Set(activeCodes)];
    }

    /**
     * Get integrated site detail data
     */
    async getSiteDetail(deviceSN, period = '30D') {
        // 1. Fetch customer details from DB
        const customer = await db('customerDetails as c')
            .leftJoin('customerAgreementDetails as ca', 'c.customerId', 'ca.customer_id')
            .select('c.*', 'ca.agreementSignatureDate', 'ca.systemDeliveryDate')
            .where('c.solar_device_id', deviceSN)
            .first();

        if (!customer) {
            throw new Error('Site not found');
        }

        // 2. Fetch technical specs first to check status
        const techSpecs = (await this.getDeviceTechnicalSpecs(deviceSN)) || {};
        const isFault = techSpecs.status === 2 || techSpecs.status === '2';

        // 3. Fetch data from FoxESS API and local DB in parallel
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

        const promises = [
            this.getDeviceRealTimeData(deviceSN),
            this.getDeviceAlarms(deviceSN),
            db('daily_units')
                .where('inverterSno', deviceSN)
                .sum('daily_units as totalYield')
                .first(),
            db('daily_units')
                .where('inverterSno', deviceSN)
                .where('unit_date', '>=', currentMonthStart)
                .sum('daily_units as total')
                .first(),
            db('daily_units')
                .where('inverterSno', deviceSN)
                .where('unit_date', '>=', prevMonthStart)
                .where('unit_date', '<=', prevMonthEnd)
                .sum('daily_units as total')
                .first(),
            db('complaintUpdates as cu')
                .join('complaints as cp', 'cu.complaint_id', 'cp.id')
                .where('cp.customerId', customer.customerId)
                .select('cu.update', 'cu.created_date', 'cp.status as complaintStatus')
                .orderBy('cu.created_date', 'desc')
                .limit(10)
        ];

        let faultInfoPromiseIndex = -1;
        if (isFault) {
            faultInfoPromiseIndex = promises.length;
            promises.push(this.getDeviceFaults(deviceSN));
        }

        const results = await Promise.all(promises);
        const realTimeData = Array.isArray(results[0]) ? results[0] : [];
        const alarms = Array.isArray(results[1]) ? results[1] : [];
        const lifetimeYieldResult = results[2] || { totalYield: 0 };
        const currentMonthYield = results[3] || { total: 0 };
        const prevMonthYield = results[4] || { total: 0 };
        const localUpdates = Array.isArray(results[5]) ? results[5] : [];

        const rawFaults = faultInfoPromiseIndex !== -1 ? results[faultInfoPromiseIndex] : null;
        const faults = Array.isArray(rawFaults) ? rawFaults : (rawFaults ? [rawFaults] : null);

        const curMonthTotal = parseFloat(currentMonthYield?.total || 0);
        const prevMonthTotal = parseFloat(prevMonthYield?.total || 0);
        let yieldGrowth = 0;
        if (prevMonthTotal > 0) {
            yieldGrowth = ((curMonthTotal - prevMonthTotal) / prevMonthTotal) * 100;
        } else if (curMonthTotal > 0) {
            yieldGrowth = 100;
        }

        let interval = '30 DAY';
        if (period === '90D') interval = '90 DAY';
        else if (period === '1Y') interval = '1 YEAR';

        const historyData = await db('daily_units')
            .where('inverterSno', deviceSN)
            .where('unit_date', '>=', db.raw(`DATE_SUB(CURDATE(), INTERVAL ${interval})`))
            .select('unit_date', 'daily_units')
            .orderBy('unit_date', 'asc');

        const powerVar = realTimeData.find(v => v.variable === 'power' || v.variable === 'generationPower');
        let currentPower = powerVar ? parseFloat(powerVar.value || 0) : 0;

        // 6. Fetch historical power for growth (1 hour ago)
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        const lastHourPower = await this.getDeviceHistoryPower(deviceSN, oneHourAgo - (15 * 60 * 1000), oneHourAgo + (15 * 60 * 1000));

        let powerGrowth = 0;
        if (lastHourPower > 0) {
            powerGrowth = ((currentPower - lastHourPower) / lastHourPower) * 100;
        } else if (currentPower > 0 && lastHourPower === 0) {
            powerGrowth = 100;
        }

        // 7. Prepare Unified Event Log
        let unifiedEvents = [];

        // Add FoxESS alarms
        if (Array.isArray(alarms)) {
            alarms.forEach(a => {
                if (!a) return;
                unifiedEvents.push({
                    time: a.time || a.alarmTime,
                    title: a.title || 'Inverter Alarm',
                    description: a.content || a.alarmContent || 'Automatic alert from device.',
                    type: 'alarm'
                });
            });
        }

        // Add Local Complaint Updates (Maintenance logs)
        if (Array.isArray(localUpdates)) {
            localUpdates.forEach(u => {
                if (!u) return;
                unifiedEvents.push({
                    time: u.created_date,
                    title: 'System Update',
                    description: u.update,
                    type: 'status'
                });
            });
        }

        // Sort by time descending
        unifiedEvents.sort((a, b) => {
            const dateA = a.time ? new Date(a.time) : new Date(0);
            const dateB = b.time ? new Date(b.time) : new Date(0);
            return dateB - dateA;
        });

        const activeFaultCodes = this.extractActiveFaultCodes(realTimeData);
        let activeFaults = [];

        if (activeFaultCodes.length > 0) {
            const faultDict = (Array.isArray(faults) ? faults[0] : faults) || {};
            activeFaultCodes.forEach(code => {
                if (!code) return;
                const faultDesc = faultDict[code.toString()];
                if (faultDesc) {
                    activeFaults.push({
                        code: code,
                        ...faultDesc,
                        date: new Date().toISOString()
                    });
                } else if (typeof code === 'string') {
                    activeFaults.push({
                        code: 0,
                        en: code,
                        zh_CN: code,
                        date: new Date().toISOString()
                    });
                }
            });
        }

        return {
            siteInfo: {
                deviceSN: deviceSN,
                name: customer.customerName,
                address: `${customer.address || ''} ${customer.district || ''} ${customer.state || ''}`.trim(),
                lat: customer.latitude,
                lng: customer.longitude,
                stationID: techSpecs.stationID || '',
                status: techSpecs.status === 1 ? 'Active' : (techSpecs.status === 2 ? 'Fault' : 'Inactive'),
            },
            performance: {
                currentPower: techSpecs.status === 1 ? currentPower : 0,
                powerGrowth: techSpecs.status === 1 ? parseFloat(powerGrowth.toFixed(2)) : 0,
                totalYield: lifetimeYieldResult?.totalYield || 0,
                yieldGrowth: parseFloat(yieldGrowth.toFixed(2))
            },
            techSpecs: techSpecs,
            eventLog: unifiedEvents,
            faultInfo: activeFaults,
            graphData: historyData,
            period: period
        };
    }
}

module.exports = new OMPlatformService();
