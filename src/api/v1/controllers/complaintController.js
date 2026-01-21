const db = require('../../../database/db');

exports.getComplaints = async (req, res) => {
    try {
        const {
            search,
            status,
            categoryId,
            departmentId,
            limit = 10,
            offset = 0,
            sortBy,
            order = 'desc',
            startDate,
            endDate,
            customerId
        } = req.query;

        let query = db('complaints as cp')
            .leftJoin('customerDetails as c', 'cp.customerId', 'c.customerId')
            .leftJoin('complaintCategories as cat', 'cp.category', 'cat.id')
            .leftJoin('departments as d', 'cp.assignmentPerson', 'd.id')
            .select(
                'cp.id',
                'cp.status',
                'cp.createdAt as date',
                'cp.resolveDate as resolutionDate',
                'd.personName as assignedPerson',
                'c.customerName',
                'cat.name as categoryName',
                'd.departmentName'
            );

        // Date Range Filter (on createdAt)
        if (startDate && endDate) {
            query = query.whereBetween('cp.createdAt', [startDate, endDate]);
        } else if (startDate) {
            query = query.where('cp.createdAt', '>=', startDate);
        } else if (endDate) {
            query = query.where('cp.createdAt', '<=', endDate);
        }

        // Search
        if (search) {
            query = query.where(function () {
                this.where('c.customerName', 'like', `%${search}%`)
                    .orWhere('cp.id', 'like', `%${search}%`)
                    .orWhere('d.personName', 'like', `%${search}%`);
            });
        }

        // Filters
        if (status) {
            query = query.where('cp.status', status);
        }
        if (categoryId) {
            query = query.where('cp.category', categoryId);
        }
        if (departmentId) {
            query = query.where('cp.assignmentPerson', departmentId);
        }
        if (customerId) {
            query = query.where('cp.customerId', customerId);
        }

        // Sorting Mapping
        const sortMapping = {
            'ID': 'cp.id',
            'Status': 'cp.status',
            'Date': 'cp.createdAt',
            'Resolution Date': 'cp.resolveDate',
            'Assigned Person': 'd.personName',
            'Customer': 'c.customerName',
            'Category': 'cat.name',
            'Department': 'd.departmentName'
        };

        if (sortBy && sortMapping[sortBy]) {
            query = query.orderBy(sortMapping[sortBy], order);
        } else {
            query = query.orderBy('cp.createdAt', 'desc');
        }

        // Count total for pagination
        const totalCountQuery = query.clone().clearSelect().count('cp.id as total');
        const [totalCountResult] = await totalCountQuery;
        const total = totalCountResult ? totalCountResult.total : 0;

        // Fetch data
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
        console.error('Error fetching complaints:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch complaints'
        });
    }
};

exports.getCategories = async (req, res) => {
    try {
        const categories = await db('complaintCategories')
            .select('id', 'name')
            .where('status', 1)
            .orderBy('name', 'asc');

        res.status(200).json({
            status: 'success',
            data: categories
        });
    } catch (error) {
        console.error('Error fetching complaint categories:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch categories'
        });
    }
};

exports.getDepartments = async (req, res) => {
    try {
        const departments = await db('departments')
            .select('id', 'departmentName', 'personName')
            .where('status', 1)
            .orderBy('departmentName', 'asc');

        res.status(200).json({
            status: 'success',
            data: departments
        });
    } catch (error) {
        console.error('Error fetching departments:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch departments'
        });
    }
};

exports.createComplaint = async (req, res) => {
    try {
        const {
            customerId,
            category,
            assignmentPerson,
            status,
            description
        } = req.body;

        if (!customerId || !category || !assignmentPerson || !status) {
            return res.status(400).json({
                status: 'error',
                message: 'Customer ID, Category, Department, and Status are required'
            });
        }

        const [newComplaintId] = await db('complaints').insert({
            customerId,
            category,
            assignmentPerson,
            status,
            description,
            createdAt: db.fn.now(),
            updatedAt: db.fn.now()
        });

        res.status(201).json({
            status: 'success',
            message: 'Complaint created successfully',
            data: { id: newComplaintId }
        });
    } catch (error) {
        console.error('Error creating complaint:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to create complaint'
        });
    }
};
