const zohoService = require('../services/zohoService');

/**
 * Synchronize all Zoho data (Payments, Estimates, SO, Packages) for a mobile number
 */
exports.syncZohoDataByMobile = async (req, res) => {
    try {
        const { mobileNumber } = req.params;

        if (!mobileNumber) {
            return res.status(400).json({
                status: 'error',
                message: 'Mobile number is required'
            });
        }

        const syncResults = await zohoService.syncAllZohoDataByMobile(mobileNumber);

        res.status(200).json({
            status: 'success',
            message: `Zoho synchronization completed for ${mobileNumber}`,
            data: syncResults
        });

    } catch (error) {
        console.error('Error in syncZohoDataByMobile:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to synchronize Zoho data'
        });
    }
};
/**
 * Synchronize ALL Zoho data across all modules
 */
exports.bulkSyncZohoData = async (req, res) => {
    try {
        const { full } = req.body || {};
        console.log(`Bulk sync requested via API (Full: ${!!full})`);
        const syncResults = await zohoService.syncBulkZohoData({ full: !!full });

        res.status(200).json({
            status: 'success',
            message: 'Zoho bulk synchronization completed successfully',
            data: syncResults
        });

    } catch (error) {
        console.error('Error in bulkSyncZohoData:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to perform bulk Zoho synchronization'
        });
    }
};
