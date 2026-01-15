exports.getHealth = (req, res) => {
    res.status(200).json({
        status: 'success',
        message: 'Backend is up and running!',
        version: 'v1',
        timestamp: new Date().toISOString()
    });
};
