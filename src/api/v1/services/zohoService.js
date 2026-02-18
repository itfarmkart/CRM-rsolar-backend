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
    async getAllCustomersWithInvoices(limit = 100) {
//         const arr = [
//     {
//       "name": "Mukesh Patidar - N3676007641",
//       "mobileNumber": "+91-9009391179",
//       "invoiceDate": "2026-02-16",
//       "invoiceNumber": "INV-000522"
//     },
//     {
//       "name": "Pawan Kotwal - N3337001865",
//       "mobileNumber": "9981140806",
//       "invoiceDate": "2026-02-16",
//       "invoiceNumber": "INV-000521"
//     },
//     {
//       "name": "Jagdeesh Sharma - N3664004950",
//       "mobileNumber": "+91-9111369958",
//       "invoiceDate": "2026-02-14",
//       "invoiceNumber": "INV-000520"
//     },
//     {
//       "name": "Rupali Gangrade - N3664002938",
//       "mobileNumber": "8461955640",
//       "invoiceDate": "2026-02-14",
//       "invoiceNumber": "INV-000519"
//     },
//     {
//       "name": "Anand Kumar Tripathi - N3746023596",
//       "mobileNumber": "9407414500",
//       "invoiceDate": "2026-02-14",
//       "invoiceNumber": "INV-000518"
//     },
//     {
//       "name": "Neeta Stephen - N3340009059",
//       "mobileNumber": "9165970969",
//       "invoiceDate": "2026-02-12",
//       "invoiceNumber": "INV-000517"
//     },
//     {
//       "name": "Baliram Patidar - N3711009698",
//       "mobileNumber": "9926089269",
//       "invoiceDate": "2026-02-11",
//       "invoiceNumber": "INV-000516"
//     },
//     {
//       "name": "Kelash Jaat - N3670008721",
//       "mobileNumber": "9893873531",
//       "invoiceDate": "2026-02-11",
//       "invoiceNumber": "CDN-000184"
//     },
//     {
//       "name": "Akhil Khan - N3315012916",
//       "mobileNumber": "+91-9993391197",
//       "invoiceDate": "2026-02-09",
//       "invoiceNumber": "INV-000515"
//     },
//     {
//       "name": "Deepraj Muwadiya - N3337009492",
//       "mobileNumber": "+91-7389616059",
//       "invoiceDate": "2026-02-09",
//       "invoiceNumber": "INV-000514"
//     },
//     {
//       "name": "Jayantee Bai Awasya - N3330019390",
//       "mobileNumber": "+91-8458852468",
//       "invoiceDate": "2026-02-07",
//       "invoiceNumber": "INV-000513"
//     },
//     {
//       "name": "Subhash Yadav - N3337004902",
//       "mobileNumber": "9893262802",
//       "invoiceDate": "2026-02-07",
//       "invoiceNumber": "INV-000512"
//     },
//     {
//       "name": "Vijay Mahajan - N3664001737",
//       "mobileNumber": "+91-7000712234",
//       "invoiceDate": "2026-02-07",
//       "invoiceNumber": "INV-000511"
//     },
//     {
//       "name": "Brajesh Patel - N3806016317",
//       "mobileNumber": "+91-9754640209",
//       "invoiceDate": "2026-02-07",
//       "invoiceNumber": "INV-000510"
//     },
//     {
//       "name": "Bablu Kothe - N3806013761",
//       "mobileNumber": "+91-9826376966",
//       "invoiceDate": "2026-02-07",
//       "invoiceNumber": "INV-000509"
//     },
//     {
//       "name": "Lalita Prajapat - N3746011637",
//       "mobileNumber": "+91-9926078311",
//       "invoiceDate": "2026-02-07",
//       "invoiceNumber": "INV-000508"
//     },
//     {
//       "name": "PROSTARM INFO SYSTEMS LIMITED",
//       "mobileNumber": "+91-9326654345",
//       "invoiceDate": "2026-02-06",
//       "invoiceNumber": "INV-000507"
//     },
//     {
//       "name": "Mangilal Kanouje - N3315015588",
//       "mobileNumber": "+91-9993115851",
//       "invoiceDate": "2026-02-04",
//       "invoiceNumber": "INV-000506"
//     },
//     {
//       "name": "Sanjay Maru - N3341022446",
//       "mobileNumber": "9893755005",
//       "invoiceDate": "2026-02-04",
//       "invoiceNumber": "CDN-000183"
//     },
//     {
//       "name": "Sitaram Dawar - N3315010385",
//       "mobileNumber": "8085748364",
//       "invoiceDate": "2026-02-03",
//       "invoiceNumber": "INV-000505"
//     },
//     {
//       "name": "Rahul Solanki - N3330004476",
//       "mobileNumber": "9630232316",
//       "invoiceDate": "2026-02-03",
//       "invoiceNumber": "CDN-000182"
//     },
//     {
//       "name": "Mahesh Tanwar - N3746042910",
//       "mobileNumber": "9926391060",
//       "invoiceDate": "2026-02-03",
//       "invoiceNumber": "CDN-000181"
//     },
//     {
//       "name": "Suman Parmar - N3746022360",
//       "mobileNumber": "9826235578",
//       "invoiceDate": "2026-02-03",
//       "invoiceNumber": "CDN-000180"
//     },
//     {
//       "name": "Mukesh Baghel - N3315005457",
//       "mobileNumber": "8827079181",
//       "invoiceDate": "2026-02-03",
//       "invoiceNumber": "CDN-000179"
//     },
//     {
//       "name": "Suman Vaskale - N3746053162",
//       "mobileNumber": "9424080640",
//       "invoiceDate": "2026-02-03",
//       "invoiceNumber": "CDN-000178"
//     },
//     {
//       "name": "Anil Chouhan - N3746053656",
//       "mobileNumber": "9617169922",
//       "invoiceDate": "2026-02-03",
//       "invoiceNumber": "CDN-000177"
//     },
//     {
//       "name": "Motilal Gehlot - N3315031167",
//       "mobileNumber": "9644838245",
//       "invoiceDate": "2026-02-03",
//       "invoiceNumber": "CDN-000176"
//     },
//     {
//       "name": "Mohammad Salim Khatri - N3315001970",
//       "mobileNumber": "9424841301",
//       "invoiceDate": "2026-02-03",
//       "invoiceNumber": "CDN-000175"
//     },
//     {
//       "name": "Shriram Patidar - N3676017810",
//       "mobileNumber": "7354273413",
//       "invoiceDate": "2026-02-03",
//       "invoiceNumber": "CDN-000174"
//     },
//     {
//       "name": "Bharat Kumar - N3315004844",
//       "mobileNumber": "8817950505",
//       "invoiceDate": "2026-02-03",
//       "invoiceNumber": "CDN-000173"
//     },
//     {
//       "name": "Dharmendra Patidar - N3337000539",
//       "mobileNumber": "9179176699",
//       "invoiceDate": "2026-02-03",
//       "invoiceNumber": "CDN-000172"
//     },
//     {
//       "name": "Anita Bansal - N3337009247",
//       "mobileNumber": "7509999790",
//       "invoiceDate": "2026-02-02",
//       "invoiceNumber": "CDN-000171"
//     },
//     {
//       "name": "Pramila Solanki - N3315031801",
//       "mobileNumber": "9926551687",
//       "invoiceDate": "2026-02-02",
//       "invoiceNumber": "CDN-000170"
//     },
//     {
//       "name": "Prakash Hammad - N3338006096",
//       "mobileNumber": "+91-7879050485",
//       "invoiceDate": "2026-02-02",
//       "invoiceNumber": "INV-000504"
//     },
//     {
//       "name": "Chandralekha Jat - N3670004750",
//       "mobileNumber": "+91-7879311679",
//       "invoiceDate": "2026-02-02",
//       "invoiceNumber": "INV-000503"
//     },
//     {
//       "name": "Hukumchand Solanki - N3339013287",
//       "mobileNumber": "7747804140",
//       "invoiceDate": "2026-02-02",
//       "invoiceNumber": "INV-000502"
//     },
//     {
//       "name": "Sunil Patil - N3664003232",
//       "mobileNumber": "8966920182",
//       "invoiceDate": "2026-01-31",
//       "invoiceNumber": "CDN-000168"
//     },
//     {
//       "name": "Bhaiyalal Punasya - N3664002521",
//       "mobileNumber": "+91-8462886545",
//       "invoiceDate": "2026-01-31",
//       "invoiceNumber": "CDN-000167"
//     },
//     {
//       "name": "Sanjay Malviya - N3337001925",
//       "mobileNumber": "+91-9977675701",
//       "invoiceDate": "2026-01-31",
//       "invoiceNumber": "INV-000501"
//     },
//     {
//       "name": "Ajay Kanungo - N3315033070",
//       "mobileNumber": "+91-9424586227",
//       "invoiceDate": "2026-01-31",
//       "invoiceNumber": "INV-000500"
//     },
//     {
//       "name": "Babita Kushwah - N3746059937",
//       "mobileNumber": "9752250506",
//       "invoiceDate": "2026-01-31",
//       "invoiceNumber": "INV-000499"
//     },
//     {
//       "name": "Laxman Alanse - N3315006416",
//       "mobileNumber": "+91-9993569054",
//       "invoiceDate": "2026-01-31",
//       "invoiceNumber": "INV-000498"
//     },
//     {
//       "name": "Deepak Kumawat - N3335004142",
//       "mobileNumber": "+91-9009128309",
//       "invoiceDate": "2026-01-31",
//       "invoiceNumber": "INV-000497"
//     },
//     {
//       "name": "Sanjay Sharma - N3181026691",
//       "mobileNumber": "+91-9685601008",
//       "invoiceDate": "2026-01-28",
//       "invoiceNumber": "INV-000496"
//     },
//     {
//       "name": "Anil Mangilal Patidar - N3337005476",
//       "mobileNumber": "9993141003",
//       "invoiceDate": "2026-01-31",
//       "invoiceNumber": "CDN-000165"
//     },
//     {
//       "name": "Salma Aslam - N3315012636",
//       "mobileNumber": "9893501041",
//       "invoiceDate": "2026-01-31",
//       "invoiceNumber": "CDN-000163"
//     },
//     {
//       "name": "Navnit Bhawsar - N3341024088",
//       "mobileNumber": "9754364048",
//       "invoiceDate": "2026-01-31",
//       "invoiceNumber": "CDN-000161"
//     },
//     {
//       "name": "Mukesh Korekar - N3746041455",
//       "mobileNumber": "9926576772",
//       "invoiceDate": "2026-01-31",
//       "invoiceNumber": "CDN-000160"
//     },
//     {
//       "name": "Dileep Yadev - N3341034180",
//       "mobileNumber": "9981085203",
//       "invoiceDate": "2026-01-30",
//       "invoiceNumber": "CDN-000159"
//     },
//     {
//       "name": "Prakash Kharte - N3341022438",
//       "mobileNumber": "9977459419",
//       "invoiceDate": "2025-12-29",
//       "invoiceNumber": "CDN-000158"
//     },
//     {
//       "name": "Ravi Soni - N3337005037",
//       "mobileNumber": "9981625143",
//       "invoiceDate": "2026-01-31",
//       "invoiceNumber": "CDN-000157"
//     },
//     {
//       "name": "Jagdish Chandra Palod - N3372003355",
//       "mobileNumber": "9300718000",
//       "invoiceDate": "2026-01-31",
//       "invoiceNumber": "CDN-000156"
//     },
//     {
//       "name": "Rohit Choudhari - N3315028202",
//       "mobileNumber": "9691617054",
//       "invoiceDate": "2026-01-31",
//       "invoiceNumber": "CDN-000155"
//     },
//     {
//       "name": "Girish Goswami - N3315021262",
//       "mobileNumber": "9926461351",
//       "invoiceDate": "2026-01-31",
//       "invoiceNumber": "CDN-000154"
//     },
//     {
//       "name": "Lalsingh Sapane - N3315012228",
//       "mobileNumber": "9575012354",
//       "invoiceDate": "2026-01-31",
//       "invoiceNumber": "CDN-000153"
//     },
//     {
//       "name": "Mohan Rathod - N3675006711",
//       "mobileNumber": "+91-9770375710",
//       "invoiceDate": "2026-01-29",
//       "invoiceNumber": "CDN-000152"
//     },
//     {
//       "name": "Mamta Nadiwal - N3806014541",
//       "mobileNumber": "+91-9131134221",
//       "invoiceDate": "2026-01-28",
//       "invoiceNumber": "INV-000495"
//     },
//     {
//       "name": "Rakesh Jogi - N3315030718",
//       "mobileNumber": "+91-9755515259",
//       "invoiceDate": "2026-01-28",
//       "invoiceNumber": "INV-000494"
//     },
//     {
//       "name": "Ashok Pratap Singh - N3746025525",
//       "mobileNumber": "9669888203",
//       "invoiceDate": "2025-06-27",
//       "invoiceNumber": "CDN-000151"
//     },
//     {
//       "name": "Nirmala Bai Soni - N3664001497",
//       "mobileNumber": "9806351899",
//       "invoiceDate": "2026-01-28",
//       "invoiceNumber": "INV-000493"
//     },
//     {
//       "name": "Umesh Chouhan - N3315027656",
//       "mobileNumber": "+91-8120786677",
//       "invoiceDate": "2026-01-24",
//       "invoiceNumber": "INV-000492"
//     },
//     {
//       "name": "Antar Singh Solanki - N3315026826",
//       "mobileNumber": "+91-9993196819",
//       "invoiceDate": "2026-01-24",
//       "invoiceNumber": "INV-000491"
//     },
//     {
//       "name": "PUSHPA DARASINGH BARDE - N3315026965",
//       "mobileNumber": "+91-9165880121",
//       "invoiceDate": "2026-01-24",
//       "invoiceNumber": "INV-000490"
//     },
//     {
//       "name": "Narmada Prasad More - N2265024983",
//       "mobileNumber": "+91-7223980782",
//       "invoiceDate": "2026-01-23",
//       "invoiceNumber": "INV-000489"
//     },
//     {
//       "name": "Mamta Mishra - N2261008321",
//       "mobileNumber": "+91-6267019854",
//       "invoiceDate": "2026-01-23",
//       "invoiceNumber": "INV-000488"
//     },
//     {
//       "name": "Ravi Shankar Jaiswal - N3315017530",
//       "mobileNumber": "9630718503",
//       "invoiceDate": "2026-01-23",
//       "invoiceNumber": "INV-000487"
//     },
//     {
//       "name": "Gokul Mali - N3315015249",
//       "mobileNumber": "+91-8827885834",
//       "invoiceDate": "2026-01-23",
//       "invoiceNumber": "INV-000486"
//     },
//     {
//       "name": "Rakesh Yaduvanshi - N3678039669",
//       "mobileNumber": "+91-9753418171",
//       "invoiceDate": "2026-01-23",
//       "invoiceNumber": "INV-000485"
//     },
//     {
//       "name": "Tilokchandra Mewade - N3335005432",
//       "mobileNumber": "9669721086",
//       "invoiceDate": "2026-01-22",
//       "invoiceNumber": "CDN-000148"
//     },
//     {
//       "name": "Ashvin Nagdoi - N3746010833",
//       "mobileNumber": "+91-9977757557",
//       "invoiceDate": "2026-01-21",
//       "invoiceNumber": "CDN-000146"
//     },
//     {
//       "name": "Nilesh Patidar - N3720009307",
//       "mobileNumber": "+91-8827667737",
//       "invoiceDate": "2026-01-17",
//       "invoiceNumber": "INV-000484"
//     },
//     {
//       "name": "Rajesh Kumar Tandan - N3664006162",
//       "mobileNumber": "+91-8463084762",
//       "invoiceDate": "2026-01-17",
//       "invoiceNumber": "INV-000483"
//     },
//     {
//       "name": "Bhupendra Dabi - N3338005925",
//       "mobileNumber": "+91-9893525112",
//       "invoiceDate": "2026-01-09",
//       "invoiceNumber": "INV-000482"
//     },
//     {
//       "name": "Santoshi Khanna - N3338001223",
//       "mobileNumber": "9644046384",
//       "invoiceDate": "2026-01-09",
//       "invoiceNumber": "INV-000481"
//     },
//     {
//       "name": "Arshi Ali - N2411011566",
//       "mobileNumber": "7999634165",
//       "invoiceDate": "2026-01-09",
//       "invoiceNumber": "CDN-000143"
//     },
//     {
//       "name": "Gabbar Singh Meena - N2345011639",
//       "mobileNumber": "6264140039",
//       "invoiceDate": "2026-01-09",
//       "invoiceNumber": "CDN-000142"
//     },
//     {
//       "name": "Rajeev Meena - N2345049541",
//       "mobileNumber": "9179501499",
//       "invoiceDate": "2026-01-09",
//       "invoiceNumber": "CDN-000141"
//     },
//     {
//       "name": "Hemant Sharma - N3315001218",
//       "mobileNumber": "9424057155",
//       "invoiceDate": "2026-01-07",
//       "invoiceNumber": "CDN-000139"
//     },
//     {
//       "name": "Deepak kushwah - N3746027930",
//       "mobileNumber": "9753728142",
//       "invoiceDate": "2026-01-07",
//       "invoiceNumber": "CDN-000138"
//     },
//     {
//       "name": "FARMKART ONLINE SERVICES PRIVATE LIMITED",
//       "mobileNumber": "9407217000",
//       "invoiceDate": "2026-01-07",
//       "invoiceNumber": "INV-000480"
//     },
//     {
//       "name": "Manjula Khanna - N3315026290",
//       "mobileNumber": "9893476201",
//       "invoiceDate": "2026-01-07",
//       "invoiceNumber": "INV-000479"
//     },
//     {
//       "name": "Jitendra Singh Dangi - N3746048950",
//       "mobileNumber": "9893137177",
//       "invoiceDate": "2026-01-07",
//       "invoiceNumber": "INV-000478"
//     },
//     {
//       "name": "Ravi Gole - N3315003473",
//       "mobileNumber": "9589037601",
//       "invoiceDate": "2026-01-06",
//       "invoiceNumber": "CDN-000137"
//     },
//     {
//       "name": "Bhagwati Patidar - N3330006317",
//       "mobileNumber": "9753360374",
//       "invoiceDate": "2026-01-05",
//       "invoiceNumber": "INV-000476"
//     },
//     {
//       "name": "Umesh Bhawasar - N3179035317",
//       "mobileNumber": "8878816316",
//       "invoiceDate": "2026-01-02",
//       "invoiceNumber": "CDN-000132"
//     },
//     {
//       "name": "Chitranjan Patidar - N3330019794",
//       "mobileNumber": "9425477650",
//       "invoiceDate": "2026-01-02",
//       "invoiceNumber": "CDN-000131"
//     }
//   ];

//   for (let index = 0; index < arr.length; index++) {
//     const element = arr[index];
//     let mobileNumber = element.mobileNumber;
//                         // Normalize mobile number (remove spaces, dashes, country code)
//                         mobileNumber = mobileNumber.replace(/[\s\-]/g, '').replace(/^(\+91|91)/, '');
//                         //add 25 years to invoice date to get warranty end date
//                         const warrantyEndDate = new Date(element.invoiceDate);
//                         warrantyEndDate.setFullYear(warrantyEndDate.getFullYear() + 25);

//                         //add 10 years to invoice date to get panel expiry date
//                         const inverter = new Date(element.invoiceDate);
//                         inverter.setFullYear(inverter.getFullYear() + 10);

//                         await db('customerDetails')
//                             .where('mobileNumber', mobileNumber)
//                             .update({
//                                 invoiceDate: element.invoiceDate,
//                                 panelExpiryDate: warrantyEndDate.toISOString().split('T')[0], // Store as YYYY-MM-DD
//                                 inverterExpiryDate: inverter.toISOString().split('T')[0] // Store as YYYY-MM-DD
//                             });
    
//   }

  

//   return true;

        try {
            const token = await this.getAccessToken();
            const config = {
                headers: { 'Authorization': `Zoho-oauthtoken ${token}` }
            };

            // Fetch recent invoices
            const url = `${this.baseUrl}invoices?organization_id=${this.orgId}&page=1&per_page=${limit}`;
            const res = await axios.get(url, config);
            const invoices = res.data.invoices || [];

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

            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Zoho-oauthtoken ${token}`
                },
                responseType: 'arraybuffer'
            });

            return response.data;
        } catch (error) {
            console.error('Zoho getInvoicePdf Error:', error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = new ZohoService();
