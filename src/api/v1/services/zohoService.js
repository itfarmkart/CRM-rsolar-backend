const axios = require('axios');
const db = require('../../../database/db');

class ZohoService {
    constructor() {
        this.refreshToken = process.env.ZOHO_REFRESH_TOKEN_RSOLAR;
        this.clientId = process.env.ZOHO_CLIENT_ID_RSOLAR;
        this.clientSecret = process.env.ZOHO_CLIENT_SECRET_RSOLAR;
        this.tokenUrl = process.env.ZOHO_REFRESH_TOKEN_URL_RSOLAR;
        this.baseUrl = process.env.ZOHO_BASE_URL_RSOLAR;
        this.orgId = process.env.ZOHO_ORGANIZATION_ID_RSOLAR;

        this.accessToken = null;
        this.tokenExpiry = 0;
    }

    /**
     * Get OAuth 2.0 access token, refreshing if necessary
     */
    async getAccessToken() {
        const now = Date.now();
        // If we have a token and it's not expired (with 1 minute buffer)
        if (this.accessToken && this.tokenExpiry > now + 60000) {
            return this.accessToken;
        }

        try {
            console.log('Refreshing Zoho Access Token...');
            const params = new URLSearchParams();
            params.append('refresh_token', this.refreshToken);
            params.append('client_id', this.clientId);
            params.append('client_secret', this.clientSecret);
            params.append('grant_type', 'refresh_token');

            const response = await axios.post(this.tokenUrl, params, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            if (response.data && response.data.access_token) {
                console.log('Zoho Access Token refreshed successfully');
                this.accessToken = response.data.access_token;
                // expires_in is usually 3600 seconds
                this.tokenExpiry = now + (response.data.expires_in * 1000);
                return this.accessToken;
            } else {
                console.error('Failed to refresh Zoho token. Response:', JSON.stringify(response.data));
                throw new Error('Failed to refresh Zoho token');
            }
        } catch (error) {
            console.error('Zoho Token Refresh Error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Search for invoices by mobile number (reference_number)
     */
    async getInventoryDetailsByMobile(mobileNumber) {
        try {
            const token = await this.getAccessToken();
            const config = {
                headers: {
                    'Authorization': `Zoho-oauthtoken ${token}`
                }
            };

            console.log(`Searching Zoho Invoices (search_text) for: ${mobileNumber}`);
            const searchUrl = `${this.baseUrl}invoices?search_text=${mobileNumber}&organization_id=${this.orgId}`;

            const response = await axios.get(searchUrl, config);
            let invoices = response.data.invoices || [];
            // If no invoices found by search_text, try searching contacts first
            if (invoices.length === 0) {
                console.log(`No invoices found by search_text. Searching contacts for: ${mobileNumber}`);

                // Try searching with variants and different field filters
                const searchVariants = [mobileNumber, `+91-${mobileNumber}`];
                let foundContact = null;

                for (const variant of searchVariants) {
                    console.log(`Checking contact search for variant: ${variant}`);

                    // Try global search_text
                    let contactSearchUrl = `${this.baseUrl}contacts?search_text=${variant}&organization_id=${this.orgId}`;
                    let contactResponse = await axios.get(contactSearchUrl, config);
                    let contacts = contactResponse.data.contacts || [];

                    if (contacts.length === 0) {
                        // Try phone_contains
                        contactSearchUrl = `${this.baseUrl}contacts?phone_contains=${variant}&organization_id=${this.orgId}`;
                        contactResponse = await axios.get(contactSearchUrl, config);
                        contacts = contactResponse.data.contacts || [];
                    }

                    if (contacts.length === 0) {
                        // Try mobile_phone_contains
                        contactSearchUrl = `${this.baseUrl}contacts?mobile_phone_contains=${variant}&organization_id=${this.orgId}`;
                        contactResponse = await axios.get(contactSearchUrl, config);
                        contacts = contactResponse.data.contacts || [];
                    }

                    if (contacts.length > 0) {
                        foundContact = contacts[0];
                        break;
                    }
                }

                if (foundContact) {
                    const contactId = foundContact.contact_id;
                    console.log(`Found contact: ${foundContact.contact_name} (ID: ${contactId}). Fetching their invoices...`);
                    const contactInvoicesUrl = `${this.baseUrl}invoices?customer_id=${contactId}&organization_id=${this.orgId}`;
                    const contactInvoicesRes = await axios.get(contactInvoicesUrl, config);
                    invoices = contactInvoicesRes.data.invoices || [];
                }
            }

            if (invoices.length === 0) {
                console.log(`No invoices found for mobile: ${mobileNumber}`);
                return [];
            }

            const results = [];

            // Fetch details for each matched invoice (or just a few if too many)
            const invoicesToFetch = invoices.slice(0, 5); // Limit to 5 results for now

            for (const inv of invoicesToFetch) {
                const invoiceDetailUrl = `${this.baseUrl}invoices/${inv.invoice_id}?organization_id=${this.orgId}`;
                const detailResponse = await axios.get(invoiceDetailUrl, config);
                const invoiceData = detailResponse.data.invoice;

                // Extract panels and inverter details
                const panels = [];
                const inverters = [];

                if (invoiceData && invoiceData.line_items) {
                    invoiceData.line_items.forEach(item => {
                        const itemName = (item.name || '').toLowerCase();
                        const itemDesc = (item.description || '').toLowerCase();

                        const itemDetail = {
                            name: item.name,
                            description: item.description,
                            sku: item.sku || '',
                            quantity: item.quantity,
                            rate: item.rate,
                            hsn_or_sac: item.hsn_or_sac
                        };

                        if (itemName.includes('panel') || itemDesc.includes('panel')) {
                            panels.push(itemDetail);
                        } else if (itemName.includes('inverter') || itemDesc.includes('inverter')) {
                            inverters.push(itemDetail);
                        }
                    });
                }

                results.push({
                    invoiceNumber: invoiceData.invoice_number,
                    invoiceDate: invoiceData.date,
                    customerName: invoiceData.customer_name,
                    mobileNumber: invoiceData.phone || invoiceData.mobile || mobileNumber,
                    invoiceId: invoiceData.invoice_id,
                    panels: panels,
                    inverters: inverters,
                    allLineItems: invoiceData.line_items
                });
            }

            return results;

        } catch (error) {
            console.error('Zoho getInventoryDetailsByMobile Error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Fetch all customers who have invoices, including their mobile and latest invoice date
     */
    async getAllCustomersWithInvoices(limit = 1000) {

        try {
            const token = await this.getAccessToken();
            const config = {
                headers: { 'Authorization': `Zoho-oauthtoken ${token}` }
            };

            // Fetch recent invoices
            const url = `${this.baseUrl}invoices?organization_id=${this.orgId}&page=1&per_page=${100000}`;
            const res = await axios.get(url, config);
            const invoices = res.data.invoices || [];
            return invoices;
            const customerSummary = new Map();

            for (const inv of invoices) {
                if (customerSummary.has(inv.customer_id)) continue;

                // Fetch contact details for mobile number
                const contactUrl = `${this.baseUrl}contacts/${inv.customer_id}?organization_id=${this.orgId}`;
                try {
                    const contactRes = await axios.get(contactUrl, config);
                    const c = contactRes.data.contact;

                    // update customerDetails in db if mobile number is not present in db
                    if (c.mobile || c.phone) {
                        let mobileNumber = c.mobile || c.phone;
                        // Normalize mobile number (remove spaces, dashes, country code)
                        mobileNumber = mobileNumber.replace(/[\s\-]/g, '').replace(/^(\+91|91)/, '');
                        //add 25 years to invoice date to get warranty end date
                        const warrantyEndDate = new Date(inv.date);
                        warrantyEndDate.setFullYear(warrantyEndDate.getFullYear() + 25);

                        //add 10 years to invoice date to get panel expiry date
                        const inverter = new Date(inv.date);
                        inverter.setFullYear(inverter.getFullYear() + 10);

                        await db('customerDetails')
                            .where('mobileNumber', mobileNumber)
                            .update({
                                invoiceDate: inv.date,
                                panelExpiryDate: warrantyEndDate.toISOString().split('T')[0], // Store as YYYY-MM-DD
                                inverterExpiryDate: inverter.toISOString().split('T')[0] // Store as YYYY-MM-DD
                            });
                    }

                    customerSummary.set(inv.customer_id, {
                        name: inv.customer_name,
                        mobileNumber: c.mobile || c.phone || 'N/A',
                        invoiceDate: inv.date,
                        invoiceNumber: inv.invoice_number
                    });
                } catch (err) {
                    // console.error(`Failed to fetch contact ${inv.customer_id}:`, err.message);
                }
            }

            return Array.from(customerSummary.values());
        } catch (error) {
            console.error('Zoho getAllCustomersWithInvoices Error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Fetch invoice as a PDF buffer
     */
    async getInvoicePdf(invoiceId) {
        try {
            const token = await this.getAccessToken();
            const url = `${this.baseUrl}invoices/${invoiceId}?organization_id=${this.orgId}&accept=pdf`;
            console.log(`Zoho PDF URL: ${url}`);

            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Zoho-oauthtoken ${token}`
                },
                responseType: 'arraybuffer'
            });

            return response.data;
        } catch (error) {
            console.error('Zoho getInvoicePdf Error!');
            console.error('URL attempted:', `${this.baseUrl}invoices/${invoiceId}?organization_id=${this.orgId}&accept=pdf`);
            console.error('Error info:', error.response?.data ? error.response.data.toString() : error.message);
            throw error;
        }
    }
}

module.exports = new ZohoService();
