const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');

class S3Service {
    constructor() {
        this.s3Client = new S3Client({
            region: process.env.AWS_DEFAULT_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            }
        });
        this.bucket = process.env.AWS_BUCKET;
    }

    async checkObjectExists(key) {
        try {
            const command = new HeadObjectCommand({
                Bucket: this.bucket,
                Key: key
            });
            await this.s3Client.send(command);
            return true;
        } catch (error) {
            if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
                return false;
            }
            console.error('S3 HeadObject Error:', error);
            return false;
        }
    }
}

module.exports = new S3Service();
