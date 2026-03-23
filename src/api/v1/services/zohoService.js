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

    normalizePhone(phone) {
        if (!phone) return '';
        const cleaned = phone.toString().replace(/\D/g, '');
        return cleaned.slice(-10);
    }

    /**
     * Get the latest last_modified_time from a table
     */
    async getLastModifiedTime(tableName) {
        try {
            const lastRecord = await db(tableName).whereNotNull('last_modified_time').orderBy('last_modified_time', 'desc').first();
            if (lastRecord && lastRecord.last_modified_time) {
                const date = new Date(lastRecord.last_modified_time);
                if (isNaN(date.getTime()) || date.getTime() === 0) return null;
                // Format: 2022-03-09T19:38:49+0000
                return date.toISOString().split('.')[0] + "+0000"; 
            }
            return null;
        } catch (error) {
            return null;
        }
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
    async getAllCustomersWithInvoices() {
        try {
            const token = await this.getAccessToken();
            const config = {
                headers: { 'Authorization': `Zoho-oauthtoken ${token}` }
            };

            let allInvoices = [];
            let page = 1;
            let hasMore = true;
            const perPage = 200;

            while (hasMore) {
                const url = `${this.baseUrl}invoices?organization_id=${this.orgId}&page=${page}&per_page=${perPage}&type=invoice`;
                const res = await axios.get(url, config);
                const invoices = res.data.invoices || [];

                allInvoices = allInvoices.concat(invoices);

                const pageContext = res.data.page_context;
                hasMore = pageContext ? pageContext.has_more_page : false;
                page++;

                if (page > 50) break;
            }

            const customerSummary = new Map();

            // Process unique customers from the full list
            for (const inv of allInvoices) {
                if (customerSummary.has(inv.customer_id)) continue;

                // Fetch contact details for mobile number
                const contactUrl = `${this.baseUrl}contacts/${inv.customer_id}?organization_id=${this.orgId}`;
                try {
                    const contactRes = await axios.get(contactUrl, config);
                    const c = contactRes.data.contact;

                    if (c.mobile || c.phone) {
                        let mobileNumber = c.mobile || c.phone;
                        // Normalize mobile number
                        mobileNumber = mobileNumber.replace(/[\s\-]/g, '').replace(/^(\+91|91)/, '');

                        // Calculate expiry dates (Warranty 25y, Inverter 10y)
                        const warrantyEndDate = new Date(inv.date);
                        warrantyEndDate.setFullYear(warrantyEndDate.getFullYear() + 25);

                        const inverterEndDate = new Date(inv.date);
                        inverterEndDate.setFullYear(inverterEndDate.getFullYear() + 10);

                        // Update local database
                        await db('customerDetails')
                            .where('mobileNumber', mobileNumber)
                            .update({
                                invoiceDate: inv.date,
                                panelExpiryDate: warrantyEndDate.toISOString().split('T')[0],
                                inverterExpiryDate: inverterEndDate.toISOString().split('T')[0]
                            });
                    }

                    customerSummary.set(inv.customer_id, {
                        name: inv.customer_name,
                        mobileNumber: c.mobile || c.phone || 'N/A',
                        invoiceDate: inv.date,
                        invoiceNumber: inv.invoice_number
                    });
                } catch (err) {
                    // console.error(`Failed to fetch contact/update DB for ${inv.customer_id}:`, err.message);
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
    /**
     * Fetch all Zoho data for a mobile number and update local database
     */
    /**
     * Fetch all Zoho data for a mobile number and update local database
     */
    async syncAllZohoDataByMobile(mobileNumber) {
        const last10 = this.normalizePhone(mobileNumber);
        if (last10.length < 10) {
            throw new Error(`Invalid mobile number for sync: ${mobileNumber}`);
        }

        console.log(`🚀 Starting Comprehensive Zoho Sync for: ${last10}`);
        const token = await this.getAccessToken();
        const config = { headers: { 'Authorization': `Zoho-oauthtoken ${token}` } };
        const results = { payments: 0, estimates: 0, salesOrders: 0, packages: 0 };

        try {
            // 0. Find the Zoho Contact by mobile number first
            console.log(`🔍 Finding Zoho Contact for mobile: ${last10}`);
            let contactId = null;
            const searchVariants = [last10, `91${last10}`, `+91${last10}`];

            for (const variant of searchVariants) {
                const searchUrls = [
                    `${this.baseUrl.replace('inventory/v1/', 'books/v3/')}contacts?search_text=${variant}&organization_id=${this.orgId}`,
                    `${this.baseUrl.replace('inventory/v1/', 'books/v3/')}contacts?phone_contains=${variant}&organization_id=${this.orgId}`,
                    `${this.baseUrl.replace('inventory/v1/', 'books/v3/')}contacts?mobile_phone_contains=${variant}&organization_id=${this.orgId}`
                ];

                for (const url of searchUrls) {
                    console.log(`📡 Searching Zoho: ${url}`);
                    const contactResponse = await axios.get(url, config);
                    const contacts = contactResponse.data.contacts || [];

                    if (contacts.length > 0) {
                        const matchedContact = contacts.find(c =>
                            this.normalizePhone(c.phone) === last10 ||
                            this.normalizePhone(c.mobile) === last10
                        );
                        if (matchedContact) {
                            contactId = matchedContact.contact_id;
                            console.log(`✅ Found Contact: ${matchedContact.contact_name} (ID: ${contactId})`);
                            break;
                        }
                    }
                }
                if (contactId) break;
            }

            if (!contactId) {
                console.log(`⚠️ No Zoho Contact found for mobile: ${last10}`);
                return results;
            }

            console.log(`🔍 Contact found: ${contactId}. Fetching related data...`);

            // 1. Fetch Payments for this Contact
            const payUrl = `${this.baseUrl.replace('inventory/v1/', 'books/v3/')}customerpayments?organization_id=${this.orgId}&customer_id=${contactId}`;
            console.log(`📡 Fetching Payments: ${payUrl}`);
            const payRes = await axios.get(payUrl, config);
            const payments = payRes.data.customerpayments || [];

            for (const p of payments) {
                await db('zoho_payments')
                    .insert({
                        payment_id: p.payment_id,
                        customer_id: p.customer_id,
                        mobile_number: last10,
                        customer_name: p.customer_name,
                        amount: p.amount || 0,
                        unused_amount: p.unused_amount || 0,
                        date: p.date,
                        account_name: p.account_name,
                        reference_number: p.reference_number
                    })
                    .onConflict('payment_id')
                    .merge();
                results.payments++;
            }

            // 2. Fetch Estimates for this Contact
            const estUrl = `${this.baseUrl.replace('inventory/v1/', 'books/v3/')}estimates?organization_id=${this.orgId}&customer_id=${contactId}`;
            const estRes = await axios.get(estUrl, config);
            const estimates = estRes.data.estimates || [];

            for (const e of estimates) {
                const detailUrl = `${this.baseUrl.replace('inventory/v1/', 'books/v3/')}estimates/${e.estimate_id}?organization_id=${this.orgId}`;
                const detailRes = await axios.get(detailUrl, config);
                const fullEst = detailRes.data.estimate;

                await db('zoho_estimates')
                    .insert({
                        estimate_id: e.estimate_id,
                        estimate_number: e.estimate_number,
                        mobile_number: last10,
                        customer_name: e.customer_name,
                        date: e.date,
                        total: e.total || 0,
                        billing_phone: fullEst?.billing_address?.phone || ''
                    })
                    .onConflict('estimate_id')
                    .merge();
                results.estimates++;
            }

            // 3. Fetch Sales Orders for this Contact
            const soUrl = `${this.baseUrl.replace('inventory/v1/', 'books/v3/')}salesorders?organization_id=${this.orgId}&customer_id=${contactId}`;
            const soRes = await axios.get(soUrl, config);
            const salesOrders = soRes.data.salesorders || [];

            for (const so of salesOrders) {
                await db('zoho_sales_orders')
                    .insert({
                        salesorder_id: so.salesorder_id,
                        salesorder_number: so.salesorder_number,
                        mobile_number: last10,
                        customer_name: so.customer_name,
                        status: so.status,
                        total: so.total || 0,
                        last_modified_time: so.last_modified_time
                    })
                    .onConflict('salesorder_id')
                    .merge();
                results.salesOrders++;
            }

            // 4. Fetch Packages (Serial Numbers) from Zoho Inventory
            for (const so of salesOrders) {
                const pkgUrl = `${this.baseUrl}packages?organization_id=${this.orgId}&salesorder_id=${so.salesorder_id}`;
                const pkgRes = await axios.get(pkgUrl, config);
                const packages = pkgRes.data.packages || [];

                for (const pkg of packages) {
                    const pkgDetailUrl = `${this.baseUrl}packages/${pkg.package_id}?organization_id=${this.orgId}`;
                    const pkgDetailRes = await axios.get(pkgDetailUrl, config);
                    const p = pkgDetailRes.data.package;

                    const customer = await db('customerDetails').where('mobileNumber', 'like', `%${last10}%`).first();
                    if (customer) {
                        // Update Panel Details (Upsert based on customer_id)
                        await db('panelDetails')
                            .insert({
                                customer_id: customer.customerId,
                                serialNumber1: p.cf_panel_1_serial_number || '',
                                serialNumber2: p.cf_panel_2_serial_number || '',
                                serialNumber3: p.cf_panel_3_serial_number || '',
                                serialNumber4: p.cf_panel_4_serial_number || '',
                                serialNumber5: p.cf_panel_5_serial_number || '',
                                serialNumber6: p.cf_panel_6_more_serial_numbers || '',
                                itemName: 'Solar Panel',
                                manufacturerName: p.delivery_method || ''
                            })
                            .onConflict('customer_id')
                            .merge();

                        // Update Inverter Details (Upsert based on customer_id)
                        if (p.cf_inverter_serial_number) {
                            await db('inverterDetails')
                                .insert({
                                    customer_id: customer.customerId,
                                    serialNumber: p.cf_inverter_serial_number,
                                    itemName: 'Solar Inverter'
                                })
                                .onConflict('customer_id')
                                .merge();
                        }
                    }
                    results.packages++;
                }
            }

            console.log(`✅ Sync Completed for ${last10}:`, results);
            return results;

        } catch (error) {
            console.error(`❌ Sync Failed for ${last10}:`, error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Helper to perform GET requests with automatic token refresh and retry
     */
    async apiGet(url, retryCount = 0) {
        try {
            const token = await this.getAccessToken();
            const config = { headers: { 'Authorization': `Zoho-oauthtoken ${token}` } };
            // console.log(`📡 GET: ${url}`);
            return await axios.get(url, config);
        } catch (error) {
            const status = error.response?.status;
            const data = error.response?.data;

            console.error(`❌ API Failure (${status}) for: ${url.split('?')[0]}`, JSON.stringify(data || error.message));

            if (status === 401 && retryCount < 3) {
                console.log(`🔄 401 Unauthorized for: ${url.split('?')[0]}. Retry #${retryCount + 1}`);
                this.accessToken = null; // Force token refresh on next getAccessToken call
                await new Promise(resolve => setTimeout(resolve, 500));
                return await this.apiGet(url, retryCount + 1);
            }

            if (status === 429 && retryCount < 3) {
                console.log(`⏳ Rate Limited (429) for: ${url.split('?')[0]}. Waiting 5s...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
                return await this.apiGet(url, retryCount + 1);
            }

            if (retryCount < 3) {
                console.log(`⚠️ Request Failed (Status: ${status}) for: ${url.split('?')[0]}. Retrying...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                return await this.apiGet(url, retryCount + 1);
            }

            console.error(`❌ API Final Failure: ${url.split('?')[0]}`, data || error.message);
            throw error;
        }
    }

    /**
     * Perform bulk synchronization for all Zoho records
     */
    async syncBulkZohoData(options = { full: false }) {
        const isFull = options.full === true;
        console.log(`🚀 Starting ${isFull ? 'FULL' : 'INCREMENTAL'} Zoho Synchronization...`);
        console.log('🚀 Starting BULK Zoho Synchronization...');
        const results = { contacts: 0, payments: 0, estimates: 0, salesOrders: 0, packages: 0 };

        try {
            // 1. Fetch All Contacts and build ContactId -> MobileNumber map
            console.log('📦 Fetching Zoho Contacts...');
            const contactMap = new Map();
            let page = 1;
            let hasMore = true;

            const contactFilter = !isFull ? await this.getLastModifiedTime('zoho_payments') : null;

            while (hasMore) {
                let url = `${this.baseUrl.replace('inventory/v1/', 'books/v3/')}contacts?organization_id=${this.orgId}&per_page=200&page=${page}`;
                if (contactFilter) url += `&last_modified_time=${encodeURIComponent(contactFilter)}`;
                const res = await this.apiGet(url);
                const contacts = res.data.contacts || [];
                
                for (const c of contacts) {
                    const mobile = this.normalizePhone(c.mobile || c.phone);
                    if (mobile) {
                        contactMap.set(c.contact_id, mobile);
                    }
                }
                
                results.contacts += contacts.length;
                hasMore = res.data.page_context?.has_more_page || false;
                page++;
                if (page > 50) break; // Safety break
            }
            console.log(`✅ Loaded ${contactMap.size} unique contact-phone mappings.`);

            console.log('💳 Syncing Customer Payments...');
            page = 1; hasMore = true;
            // Incremental for payments: fetch last 3 pages since it doesn't support last_modified_time filter well
            const maxPages = (!isFull) ? 3 : 100; 

            while (hasMore && page <= maxPages) {
                const url = `${this.baseUrl.replace('inventory/v1/', 'books/v3/')}customerpayments?organization_id=${this.orgId}&per_page=200&page=${page}&sort_column=date&sort_order=D`;
                const res = await this.apiGet(url);
                const payments = res.data.customerpayments || [];
                
                for (const p of payments) {
                    try {
                        const mobile = contactMap.get(p.customer_id) || '';
                        await db('zoho_payments')
                            .insert({
                                payment_id: p.payment_id,
                                customer_id: p.customer_id,
                                mobile_number: mobile,
                                customer_name: p.customer_name,
                                amount: p.amount || 0,
                                unused_amount: p.unused_amount || 0,
                                date: p.date,
                                account_name: p.account_name,
                                reference_number: p.reference_number,
                                last_modified_time: new Date() 
                            })
                            .onConflict('payment_id').merge();
                        results.payments++;
                    } catch (err) {
                        console.error(`Failed to sync payment ${p.payment_id}:`, err.message);
                    }
                }
                hasMore = res.data.page_context?.has_more_page || false;
                page++;
            }

            // 3. Sync Estimates
            console.log('📄 Syncing Estimates...');
            page = 1; hasMore = true;
            const estimateFilter = !isFull ? await this.getLastModifiedTime('zoho_estimates') : null;

            while (hasMore) {
                let url = `${this.baseUrl.replace('inventory/v1/', 'books/v3/')}estimates?organization_id=${this.orgId}&per_page=200&page=${page}`;
                if (estimateFilter) url += `&last_modified_time=${encodeURIComponent(estimateFilter)}`;
                const res = await this.apiGet(url);
                const estimates = res.data.estimates || [];
                
                for (const e of estimates) {
                    const mobile = contactMap.get(e.customer_id) || '';
                    await db('zoho_estimates')
                        .insert({
                            estimate_id: e.estimate_id,
                            estimate_number: e.estimate_number,
                            mobile_number: mobile,
                            customer_name: e.customer_name,
                            date: e.date,
                            total: e.total || 0,
                            billing_phone: '',
                            last_modified_time: (e.last_modified_time && !isNaN(new Date(e.last_modified_time).getTime())) 
                                ? new Date(e.last_modified_time) 
                                : new Date()
                        })
                        .onConflict('estimate_id').merge();
                    results.estimates++;
                }
                hasMore = res.data.page_context?.has_more_page || false;
                page++;
            }

            // 4. Sync Sales Orders
            console.log('📦 Syncing Sales Orders...');
            page = 1; hasMore = true;
            const soFilter = !isFull ? await this.getLastModifiedTime('zoho_sales_orders') : null;

            while (hasMore) {
                let url = `${this.baseUrl.replace('inventory/v1/', 'books/v3/')}salesorders?organization_id=${this.orgId}&per_page=200&page=${page}`;
                if (soFilter) url += `&last_modified_time=${encodeURIComponent(soFilter)}`;
                const res = await this.apiGet(url);
                const salesOrders = res.data.salesorders || [];
                
                for (const so of salesOrders) {
                    const mobile = contactMap.get(so.customer_id) || '';
                    await db('zoho_sales_orders')
                        .insert({
                            salesorder_id: so.salesorder_id,
                            salesorder_number: so.salesorder_number,
                            mobile_number: mobile,
                            customer_name: so.customer_name,
                            status: so.status,
                            total: so.total || 0,
                            last_modified_time: (so.last_modified_time && !isNaN(new Date(so.last_modified_time).getTime())) 
                                ? new Date(so.last_modified_time) 
                                : new Date()
                        })
                        .onConflict('salesorder_id').merge();
                    results.salesOrders++;
                }
                hasMore = res.data.page_context?.has_more_page || false;
                page++;
            }

            // 5. Sync Packages (This is slower as it needs serial numbers)
            console.log('📦 Syncing Packages and Serial Numbers...');
            try {
                page = 1; hasMore = true;
                const maxPackagePages = !isFull ? 2 : 100;

                while (hasMore && page <= maxPackagePages) {
                    let url = `${this.baseUrl}packages?organization_id=${this.orgId}&per_page=200&page=${page}`;
                    const res = await this.apiGet(url);
                    const packages = res.data.packages || [];
                    
                    for (const pkg of packages) {
                        try {
                            const detailUrl = `${this.baseUrl}packages/${pkg.package_id}?organization_id=${this.orgId}`;
                            const dRes = await this.apiGet(detailUrl);
                            const p = dRes.data.package;
                            
                            const mobile = contactMap.get(p.customer_id);
                            if (mobile) {
                                const customer = await db('customerDetails').where('mobileNumber', 'like', `%${mobile}%`).first();
                                if (customer) {
                                    await db('panelDetails').insert({
                                        customer_id: customer.customerId,
                                        serialNumber1: p.cf_panel_1_serial_number || '',
                                        serialNumber2: p.cf_panel_2_serial_number || '',
                                        serialNumber3: p.cf_panel_3_serial_number || '',
                                        serialNumber4: p.cf_panel_4_serial_number || '',
                                        serialNumber5: p.cf_panel_5_serial_number || '',
                                        serialNumber6: p.cf_panel_6_more_serial_numbers || '',
                                        itemName: 'Solar Panel',
                                        manufacturerName: p.delivery_method || ''
                                    }).onConflict('customer_id').merge();

                                    if (p.cf_inverter_serial_number) {
                                        await db('inverterDetails').insert({
                                            customer_id: customer.customerId,
                                            serialNumber: p.cf_inverter_serial_number,
                                            itemName: 'Solar Inverter'
                                        }).onConflict('customer_id').merge();
                                    }
                                }
                            }
                            results.packages++;
                        } catch (pkgError) {
                            console.error(`⚠️ Skipping package ${pkg.package_id}:`, pkgError.message);
                        }
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                    hasMore = res.data.page_context?.has_more_page || false;
                    page++;
                }
            } catch (listError) {
                console.error('⚠️ Could not sync packages list:', listError.message);
            }

            console.log('✅ BULK Sync Completed!', results);
            return results;

        } catch (error) {
            console.error('❌ BULK Sync Failed:', error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = new ZohoService();
