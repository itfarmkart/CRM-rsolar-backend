require('dotenv').config();
const zohoService = require('./src/api/v1/services/zohoService');
const axios = require('axios');

async function debugPdf() {
    try {
        const mobile = '9009391179';
        console.log(`--- DEBUG PDF FOR: ${mobile} ---`);

        // 1. Get details
        const results = await zohoService.getInventoryDetailsByMobile(mobile);
        if (!results || results.length === 0) {
            console.log('No invoices found.');
            return;
        }

        const inv = results[0];
        console.log(`Found Invoice: ${inv.invoiceNumber} (ID: ${inv.invoiceId})`);

        // 2. Try to get PDF
        const token = await zohoService.getAccessToken();
        const url = `${zohoService.baseUrl}invoices/${inv.invoiceId}?organization_id=${zohoService.orgId}&accept=pdf`;
        console.log(`Requesting PDF URL: ${url}`);

        try {
            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Zoho-oauthtoken ${token}`
                },
                responseType: 'arraybuffer'
            });
            console.log('PDF Success! Status:', response.status);
            console.log('Content-Type:', response.headers['content-type']);
            console.log('Buffer length:', response.data.length);
        } catch (err) {
            console.log('PDF Failed!');
            console.log('Status:', err.response?.status);
            console.log('Data:', err.response?.data ? err.response.data.toString() : err.message);
        }

        process.exit(0);
    } catch (error) {
        console.error('Debug failed:', error.message);
        process.exit(1);
    }
}

debugPdf();
