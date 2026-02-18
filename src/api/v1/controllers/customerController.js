const db = require('../../../database/db');
const zohoService = require('../services/zohoService');

exports.getCustomers = async (req, res) => {
    try {
        const {
            search,
            state,
            district,
            plantType,
            limit = 10,
            offset = 0,
            sortBy,
            order = 'desc', // Default to descending order
            startDate,
            endDate
        } = req.query;

        let query = db('customerDetails as c')
            .leftJoin('customerAgreementDetails as ca', 'c.customerId', 'ca.customer_id')
            .select(
                'c.*',
                'ca.agreementSignatureDate',
                'ca.systemDeliveryDate'
            );

        // Date Range Filter
        if (startDate && endDate) {
            console.log('both dates', startDate, endDate)
            query = query.whereBetween('c.addedDate', [startDate, endDate]);
        } else if (startDate) {
            query = query.where('c.addedDate', '>=', startDate);
        } else if (endDate) {
            query = query.where('c.addedDate', '<=', endDate);
        }

        // Search
        if (search) {
            query = query.where(function () {
                this.where('c.customerName', 'like', `%${search}%`)
                    .orWhere('c.mobileNumber', 'like', `%${search}%`)
                    .orWhere('c.emailId', 'like', `%${search}%`)
                    .orWhere('c.ivrsNumber', 'like', `%${search}%`);
            });
        }

        // Filters
        if (state) {
            query = query.where('c.state', state);
        }
        if (district) {
            query = query.where('c.district', district);
        }
        if (plantType) {
            query = query.where('c.solarPlantType', plantType);
        }

        // Sorting Mapping
        const sortMapping = {
            'IVRS': 'c.ivrsNumber',
            'Name': 'c.customerName',
            'Mobile': 'c.mobileNumber',
            'District': 'c.district',
            'Tehsil': 'c.tehsil',
            'Delivery Date': 'ca.systemDeliveryDate',
            'Install Date': 'ca.agreementSignatureDate', // Assuming agreement date for now, can be updated
            'Added Date': 'c.addedDate',
            'Plant Type': 'c.solarPlantType'
        };

        // Apply Sorting
        console.log(sortBy, sortMapping[sortBy])
        if (sortBy && sortMapping[sortBy]) {
            console.log('sort', sortMapping[sortBy])
            query = query.orderBy(sortMapping[sortBy], order);
        } else {
            // Default sorting
            query = query.orderBy('c.addedDate', 'desc');
        }

        // Clone query for total count
        const totalCountQuery = query.clone().clearSelect().count('c.customerId as total');
        const [totalCountResult] = await totalCountQuery;
        const total = totalCountResult.total;

        // Data query
        const data = await query
            .limit(parseInt(limit))
            .offset(parseInt(offset));

        res.status(200).json({
            status: 'success',
            data,
            pagination: {
                total,
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });
    } catch (error) {
        console.error('Error fetching customers:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch customers'
        });
    }
};

exports.getCustomerById = async (req, res) => {
    try {
        const { id } = req.params;
        const customer = await db('customerDetails as c')
            .leftJoin('customerAgreementDetails as ca', 'c.customerId', 'ca.customer_id')
            .leftJoin('panelDetails as p', 'c.customerId', 'p.customer_id')
            .leftJoin('inverterDetails as i', 'c.customerId', 'i.customer_id')
            .leftJoin('leegality as l', 'c.mobileNumber', 'l.mobileno')
            .select(
                'c.*',
                'ca.agreementSignatureDate',
                'ca.systemDeliveryDate',
                // Panel Details
                'p.panelId',
                'p.sku as panelSku',
                'p.itemName as panelItemName',
                'p.manufacturerName as panelManufacturer',
                'p.partNumber as panelPartNumber',
                'p.serialNumber1',
                'p.serialNumber2',
                'p.serialNumber3',
                'p.serialNumber4',
                'p.serialNumber5',
                'p.serialNumber6',
                // Inverter Details
                'i.inverterId',
                'i.sku as inverterSku',
                'i.itemName as inverterItemName',
                'i.manufacturerName as inverterManufacturer',
                'i.partNumber as inverterPartNumber',
                'i.serialNumber as inverterSerialNumber',
                'l.signedDate'
            )
            .where('c.customerId', id)
            .first();

        console.log('Fetched customer:', customer);

        if (!customer) {
            return res.status(404).json({
                status: 'error',
                message: 'Customer not found'
            });
        }

        res.status(200).json({
            status: 'success',
            data: customer
        });
    } catch (error) {
        console.error('Error fetching customer by ID:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch customer details'
        });
    }
};

exports.getDistricts = async (req, res) => {
    try {
        const districts = await db('customerDetails')
            .distinct('district')
            .whereNotNull('district')
            .andWhere('district', '<>', '')
            .orderBy('district', 'asc');

        const districtList = districts.map(d => d.district);

        res.status(200).json({
            status: 'success',
            data: districtList
        });
    } catch (error) {
        console.error('Error fetching districts:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch districts'
        });
    }
};

exports.getZohoInventoryDetails = async (req, res) => {
    try {
        const { mobileNumber } = req.params;

        if (!mobileNumber) {
            return res.status(400).json({
                status: 'error',
                message: 'Mobile number is required'
            });
        }

        const inventoryDetails = await zohoService.getInventoryDetailsByMobile(mobileNumber);

        res.status(200).json({
            status: 'success',
            data: inventoryDetails
        });
    } catch (error) {
        console.error('Error fetching Zoho inventory details:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to fetch Zoho inventory details'
        });
    }
};

// 5. Get all Zoho customers with invoices
exports.listAllZohoInvoicedCustomers = async (req, res) => {
    try {
        const { limit } = req.query;
        const customers = await zohoService.getAllCustomersWithInvoices(limit || 100);

        res.status(200).json({
            status: 'success',
            count: customers.length,
            data: customers
        });

    } catch (error) {
        console.error('Error listing invoiced customers:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to list invoiced customers'
        });
    }
};

exports.getZohoInventoryBill = async (req, res) => {
    try {
        const { mobileNumber } = req.params;

        if (!mobileNumber) {
            return res.status(400).json({
                status: 'error',
                message: 'Mobile number is required'
            });
        }

        // 1. Find the invoice to get the ID
        const details = await zohoService.getInventoryDetailsByMobile(mobileNumber);

        if (!details || details.length === 0 || !details[0].invoiceId) {
            return res.status(404).json({
                status: 'error',
                message: 'No invoice found for this mobile number'
            });
        }

        // Use the first (latest) invoice found
        const inventoryDetails = details[0];

        // 2. Fetch the PDF
        const pdfBuffer = await zohoService.getInvoicePdf(inventoryDetails.invoiceId);

        // 3. Send the PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Bill_${inventoryDetails.invoiceNumber}.pdf"`);
        res.status(200).send(pdfBuffer);

    } catch (error) {
        console.error('Error fetching Zoho inventory bill:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to fetch Zoho inventory bill'
        });
    }
};
