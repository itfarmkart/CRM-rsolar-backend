const db = require('../../../database/db');

exports.getAllowedEmails = async (req, res) => {
    try {
        const allowedEmails = await db('allowedEmails').select('*');

        res.status(200).json({
            status: 'success',
            data: allowedEmails
        });
    } catch (error) {
        console.error('Error fetching allowed emails:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch allowed emails'
        });
    }
};
