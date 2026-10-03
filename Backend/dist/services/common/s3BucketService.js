"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.s3Service = exports.S3Service = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const filename_1 = require("../../utils/filename");
const s3 = new client_s3_1.S3Client({
    region: process.env.AWS_REGION ?? 'eu-north-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});
const IMAGE_OPTIONS = {
    maxWidth: 1200,
    maxHeight: 1200,
    quality: 80,
    format: 'webp',
};
class S3Service {
    async uploadImage(file, retries = 3) {
        try {
            console.log(`Uploading image: ${file.originalname}`);
            console.log(`Region: ${process.env.AWS_REGION}`);
            console.log(`Bucket: ${process.env.BUCKET_NAME}`);
            console.log('File received:', file.originalname);
            console.log('File size:', file.size);
            console.log('Buffer:', file.buffer ? `Buffer size: ${file.buffer.length}` : 'Buffer is missing!');
            const processedImage = await this.processImage(file);
            console.log(`Image processed. Size: ${processedImage.length} bytes`);
            const fileName = (0, filename_1.generateUniqueFilename)(file.originalname, IMAGE_OPTIONS.format);
            console.log(`Generated filename: ${fileName}`);
            const command = new client_s3_1.PutObjectCommand({
                Bucket: process.env.BUCKET_NAME,
                Key: fileName,
                Body: processedImage,
                ContentType: file.mimetype,
            });
            console.log(`Sending to S3...`);
            const result = await Promise.race([
                s3.send(command),
                new Promise((_, reject) => setTimeout(() => reject(new Error('S3 upload timeout')), 5000))
            ]);
            console.log(`S3 upload successful`, result);
            return this.getPublicUrl(fileName);
        }
        catch (error) {
            console.log(`Upload failed:`, error);
            if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries)));
                return this.uploadImage(file, retries - 1);
            }
            throw error;
        }
    }
    async uploadMultipleImages(files, concurrency = 5) {
        console.log(process.env.AWS_REGION, process.env.BUCKET_NAME);
        const results = [];
        for (let i = 0; i < files.length; i += concurrency) {
            const batch = files.slice(i, i + concurrency);
            const batchResults = await Promise.all(batch.map(file => this.uploadImage(file)));
            results.push(...batchResults);
        }
        console.log('All images uploaded successfully:', results);
        return results;
    }
    // private async processImage(file: Express.Multer.File): Promise<Buffer> {
    //   console.log('Starting image processing...');
    //   try {
    //     const output = await sharp(file.buffer)
    //       .resize({
    //         width: IMAGE_OPTIONS.maxWidth,
    //         height: IMAGE_OPTIONS.maxHeight,
    //         fit: 'inside',
    //         withoutEnlargement: true
    //       })
    //       .toFormat(IMAGE_OPTIONS.format, {
    //         quality: IMAGE_OPTIONS.quality
    //       })
    //       .toBuffer();
    //     console.log('Image processing complete. Output size:', output.length);
    //     return output;
    //   } catch (err) {
    //     console.log('Sharp processing error:', err);
    //     throw err;
    //   }
    // }
    async processImage(file) {
        // Skip image processing, just return the raw buffer
        return file.buffer;
    }
    getPublicUrl(fileName) {
        const region = process.env.AWS_REGION;
        const bucket = process.env.BUCKET_NAME;
        console.log(`https://${bucket}.s3.${region}.amazonaws.com/${fileName}`);
        return `https://${bucket}.s3.${region}.amazonaws.com/${fileName}`;
    }
}
exports.S3Service = S3Service;
exports.s3Service = new S3Service();
//# sourceMappingURL=s3BucketService.js.map