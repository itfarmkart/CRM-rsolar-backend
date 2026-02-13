const omPlatformService = require('../services/omPlatformService');

/**
 * Get dashboard summary (Total, Active, Inactive devices)
 */
exports.getOMSummary = async (req, res) => {
    try {
        const summary = await omPlatformService.getDeviceSummary();

        res.status(200).json({
            status: 'success',
            data: summary
        });
    } catch (error) {
        console.error('Error in getOMSummary:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch O&M dashboard summary'
        });
    }
};

/**
 * Get list of devices with customer mapping, status, and filtering
 */
exports.getOMDevices = async (req, res) => {
    try {
        const { search, status, limit, offset } = req.query;

        const result = await omPlatformService.getOMDevices({
            search,
            status,
            limit: limit || 10,
            offset: offset || 0
        });

        res.status(200).json({
            status: 'success',
            data: result.data,
            pagination: {
                total: result.total,
                limit: parseInt(limit) || 10,
                offset: parseInt(offset) || 0
            }
        });
    } catch (error) {
        console.error('Error in getOMDevices:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch O&M device list'
        });
    }
};

/**
 * Get detailed information for a specific site
 */
exports.getSiteDetail = async (req, res) => {
    try {
        const { siteId } = req.params;

        if (!siteId) {
            return res.status(400).json({
                status: 'error',
                message: 'siteId is required'
            });
        }

        const { period = '30D' } = req.query;
        const detail = await omPlatformService.getSiteDetail(siteId, period);

        res.status(200).json({
            status: 'success',
            data: detail
        });
    } catch (error) {
        console.error('Error in getSiteDetail:', error);
        res.status(error.message === 'Site not found' ? 404 : 500).json({
            status: 'error',
            message: error.message || 'Failed to fetch O&M site detail'
        });
    }
};
