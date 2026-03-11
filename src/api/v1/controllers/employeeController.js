const db = require('../../../database/db');

/**
 * Controller to fetch employee permissions based on email.
 */
const getEmployeePermissions = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                status: 'error',
                message: 'Email is required in the request body'
            });
        }

        console.log(`[Permissions] Fetching data for email: ${email}`);

        // Join employee with roles and department to get full permission details
        const employeeData = await db('employees as e')
            .leftJoin('roles as r', 'e.roleId', 'r.id')
            .leftJoin('department as d', 'e.departmentId', 'd.id')
            .where('e.email', email)
            .select(
                'e.id',
                'e.fullName',
                'e.email',
                'e.status',
                'r.name as roleName',
                'r.permissions',
                'd.name as departmentName'
            )
            .first();

        if (!employeeData) {
            console.warn(`[Permissions] No employee found for email: ${email}`);
            return res.status(404).json({
                status: 'error',
                message: 'No employee found with this email'
            });
        }

        // The permissions field is stored as JSON in the database
        // MySQL with Knex should automatically parse it if using the 'json' type,
        // but let's ensure it's an object.
        let permissions = employeeData.permissions;
        if (typeof permissions === 'string') {
            try {
                permissions = JSON.parse(permissions);
            } catch (e) {
                console.error('[Permissions] Failed to parse permissions JSON:', e.message);
            }
        }

        return res.status(200).json({
            status: 'success',
            data: {
                employee: {
                    id: employeeData.id,
                    fullName: employeeData.fullName,
                    email: employeeData.email,
                    status: employeeData.status,
                    department: employeeData.departmentName,
                    role: employeeData.roleName
                },
                permissions: permissions
            }
        });

    } catch (error) {
        console.error('[Permissions Error] getEmployeePermissions:', error.message);
        return res.status(500).json({
            status: 'error',
            message: 'Internal server error while fetching permissions'
        });
    }
};

module.exports = {
    getEmployeePermissions
};
