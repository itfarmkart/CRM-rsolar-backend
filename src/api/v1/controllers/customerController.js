const db = require('../../../database/db');

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
            order = 'desc' // Default to descending order
        } = req.query;

        let query = db('customerDetails as c')
            .leftJoin('customerAgreementDetails as ca', 'c.customerId', 'ca.customer_id')
            .select(
                'c.*',
                'ca.agreementSignatureDate',
                'ca.systemDeliveryDate'
            );

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
                'i.serialNumber as inverterSerialNumber'
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
