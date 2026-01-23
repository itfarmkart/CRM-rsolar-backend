const db = require('../../../database/db');
const { sendEmail } = require('../../../utils/emailService');

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
                'd.departmentName',
                'cp.description'
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

        const insertData = {
            customerId,
            category,
            assignmentPerson,
            status,
            description,
            createdAt: db.fn.now(),
            updatedAt: db.fn.now()
        }

        if (status == 2) {
            insertData.resolveDate = db.fn.now();
        }

        const [newComplaintId] = await db('complaints').insert(insertData);

        // Send Email Notification
        try {
            const [recipient] = await db('departments').where('id', assignmentPerson).select('leadEmail', 'personName');
            const [customer] = await db('customerDetails').where('customerId', customerId).select('customerName');

            if (recipient && recipient.leadEmail) {
                const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
                const customerLink = `https://crm.myrsolar.com/customers/${customerId}`;

                await sendEmail({
                    to: recipient.leadEmail,
                    subject: `New Complaint Assigned: #${newComplaintId}`,
                    html: `
                        <h3>New Complaint Notification</h3>
                        <p>Hello ${recipient.personName || 'Team'},</p>
                        <p>A new complaint has been assigned to you.</p>
                        <ul>
                            <li><strong>Complaint ID:</strong> #${newComplaintId}</li>
                            <li><strong>Customer:</strong> ${customer ? customer.customerName : 'N/A'}</li>
                            <li><strong>Description:</strong> ${description || 'No description provided'}</li>
                        </ul>
                        <p>You can view the customer details here: <a href="${customerLink}">${customerLink}</a></p>
                        <br>
                        <p>Regards,<br>Farmkart CRM System</p>
                    `
                });
            }
        } catch (emailError) {
            console.error('Failed to send notification email:', emailError);
            // We don't return an error to the user since the complaint was already created successfully
        }

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

exports.updateComplaintStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({
                status: 'error',
                message: 'Status is required'
            });
        }

        const updateData = {
            status,
            updatedAt: db.fn.now()
        };

        if (status == 2) {
            updateData.resolveDate = db.fn.now();
        }

        const affectedRows = await db('complaints')
            .where('id', id)
            .update(updateData);

        if (affectedRows === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Complaint not found'
            });
        }

        // Send Email Notification if resolved
        if (status == 2) {
            try {
                const complaint = await db('complaints').where('id', id).select('customerId').first();
                if (complaint) {
                    const customerLink = `https://crm.myrsolar.com/customers/${complaint.customerId}`;
                    await sendEmail({
                        to: 'sachinpal@farmkart.com',
                        subject: `Complaint Resolved: #${id}`,
                        html: `
                            <h3>Complaint Resolved Notification</h3>
                            <p>Hello Sachin,</p>
                            <p>Complaint <strong>#${id}</strong> has been marked as <strong>Resolved</strong> and needs your verification.</p>
                            <p>You can view the customer details here: <a href="${customerLink}">${customerLink}</a></p>
                            <br>
                            <p>Regards,<br>Farmkart CRM System</p>
                        `
                    });
                }
            } catch (emailError) {
                console.error('Failed to send resolution notification email:', emailError);
            }
        }

        res.status(200).json({
            status: 'success',
            message: 'Complaint status updated successfully'
        });
    } catch (error) {
        console.error('Error updating complaint status:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to update complaint status'
        });
    }
};

exports.assignReminder = async (req, res) => {
    try {

        const complaint = await db('complaints').select('*');
        for (let i = 0; i < complaint.length; i++) {
            const createdAt = new Date(complaint[i].createdAt);
            const currentDate = new Date();
            const timeDiff = currentDate - createdAt;
            const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
            if (daysDiff > 2 && complaint[i].status == 1) {

                console.log('complaint', complaint)

                try {
                    const complaint = await db('complaints').where('id', id).select('customerId').first();
                    if (complaint) {
                        const customerLink = `https://crm.myrsolar.com/customers/${complaint.customerId}`;
                        await sendEmail({
                            to: 'sachinpal@farmkart.com',
                            subject: `Complaint Resolved: #${id}`,
                            html: `
                            <h3>Complaint Resolved Notification</h3>
                            <p>Hello Sachin,</p>
                            <p>Complaint <strong>#${id}</strong> has been marked as <strong>Resolved</strong> and needs your verification.</p>
                            <p>You can view the customer details here: <a href="${customerLink}">${customerLink}</a></p>
                            <br>
                            <p>Regards,<br>Farmkart CRM System</p>
                        `
                        });
                    }
                } catch (emailError) {
                    console.error('Failed to send resolution notification email:', emailError);
                }
            }
        }

        res.status(200).json({
            status: 'success',
            message: 'Complaint status updated successfully'
        });
    } catch (error) {
        console.error('Error updating complaint status:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to update complaint status'
        });
    }
};

exports.getComplaintUpdates = async (req, res) => {
    try {
        const { id } = req.params;

        const updates = await db('complaintUpdates')
            .select('id', 'complaint_id', 'update', 'created_date')
            .where('complaint_id', id)
            .orderBy('created_date', 'desc');

        res.status(200).json({
            status: 'success',
            data: updates
        });
    } catch (error) {
        console.error('Error fetching complaint updates:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch complaint updates'
        });
    }
};

exports.createComplaintUpdate = async (req, res) => {
    try {
        const { complaintId, update } = req.body;

        if (!complaintId || !update) {
            return res.status(400).json({
                status: 'error',
                message: 'Complaint ID and Update text are required'
            });
        }

        const insertData = {
            complaint_id: complaintId,
            update: update,
            created_date: db.fn.now()
        };

        const [newUpdateId] = await db('complaintUpdates').insert(insertData);

        res.status(201).json({
            status: 'success',
            message: 'Complaint update added successfully',
            data: { id: newUpdateId }
        });
    } catch (error) {
        console.error('Error adding complaint update:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to add complaint update'
        });
    }
};

exports.getComplaintDetails = async (req, res) => {
    try {
        const { id } = req.params;

        const complaint = await db('complaints as cp')
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
                'd.departmentName',
                'cp.description',
                'cp.customerId',
                'cp.category',
                'cp.assignmentPerson'
            )
            .where('cp.id', id)
            .first();

        if (!complaint) {
            return res.status(404).json({
                status: 'error',
                message: 'Complaint not found'
            });
        }

        res.status(200).json({
            status: 'success',
            data: complaint
        });
    } catch (error) {
        console.error('Error fetching complaint details:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch complaint details'
        });
    }
};
