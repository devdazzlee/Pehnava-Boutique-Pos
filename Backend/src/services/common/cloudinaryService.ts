import { v2 as cloudinary } from 'cloudinary';
import { LocalImageService } from './localImageService';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'djadwzfwg',
  api_key: process.env.CLOUDINARY_API_KEY || '199548153713428',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'gdhzagnXsXDYGrVyEx8qjzzYktY',
});

export class CloudinaryService {
  /**
   * Upload a multer file buffer to Cloudinary
   */
  async uploadImage(
    file: Express.Multer.File,
    options?: { folder?: string },
    retries = 3,
  ): Promise<string> {
    const folder = options?.folder ?? 'products';
    try {
      const result = await new Promise<string>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder,
            resource_type: 'image',
            transformation: [
              { width: 1200, height: 1200, crop: 'limit', quality: 'auto', fetch_format: 'auto' }
            ],
          },
          (error, result) => {
            if (error) return reject(error);
            resolve(result!.secure_url);
          }
        );
        uploadStream.end(file.buffer);
      });

      console.log(`Cloudinary upload successful: ${result}`);
      return result;
    } catch (error) {
      console.log('Cloudinary upload failed:', error);
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries)));
        return this.uploadImage(file, options, retries - 1);
      }
      throw error;
    }
  }

  /**
   * Upload a base64 data URI to Cloudinary
   */
  async uploadBase64Image(base64Data: string, retries = 3): Promise<string> {
    try {
      // Cloudinary accepts base64 data URIs directly: "data:image/png;base64,..."
      const result = await cloudinary.uploader.upload(base64Data, {
        folder: 'products',
        resource_type: 'image',
        transformation: [
          { width: 1200, height: 1200, crop: 'limit', quality: 'auto', fetch_format: 'auto' }
        ],
      });

      console.log(`Cloudinary base64 upload successful: ${result.secure_url}`);
      return result.secure_url;
    } catch (error) {
      console.log('Cloudinary base64 upload failed:', error);
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries)));
        return this.uploadBase64Image(base64Data, retries - 1);
      }
      throw error;
    }
  }

  /**
   * Upload multiple multer files to Cloudinary
   */
  async uploadMultipleImages(
    files: Express.Multer.File[],
    options?: { folder?: string },
    concurrency = 3,
  ): Promise<string[]> {
    const results: string[] = [];
    for (let i = 0; i < files.length; i += concurrency) {
      const batch = files.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(file => this.uploadImage(file, options))
      );
      results.push(...batchResults);
    }
    console.log('All images uploaded to Cloudinary:', results);
    return results;
  }

  /**
   * Upload multiple base64 data URIs to Cloudinary
   */
  async uploadMultipleBase64Images(base64Images: string[], concurrency = 3): Promise<string[]> {
    const results: string[] = [];
    for (let i = 0; i < base64Images.length; i += concurrency) {
      const batch = base64Images.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(b64 => this.uploadBase64Image(b64))
      );
      results.push(...batchResults);
    }
    console.log('All base64 images uploaded to Cloudinary:', results);
    return results;
  }

  /**
   * Delete an image from Cloudinary by its URL
   */
  async deleteImage(imageUrl: string): Promise<void> {
    try {
      const parts = imageUrl.split('/upload/');
      if (parts.length < 2) return;
      const pathAfterUpload = parts[1];
      const withoutVersion = pathAfterUpload.replace(/^v\d+\//, '');
      const publicId = withoutVersion.replace(/\.[^/.]+$/, '');
      await cloudinary.uploader.destroy(publicId);
      console.log(`Cloudinary image deleted: ${publicId}`);
    } catch (error) {
      console.log('Cloudinary delete failed:', error);
    }
  }

  /**
   * Delete multiple images from Cloudinary
   */
  async deleteMultipleImages(imageUrls: string[]): Promise<void> {
    await Promise.all(imageUrls.map(url => this.deleteImage(url)));
  }

  /** Cloudinary URLs are final as uploaded (naming is only done by local storage). */
  async finalizeImage(url: string, _folder: string, _name: string): Promise<string> {
    return url;
  }

  async finalizeImages(urls: string[], _folder: string, _name: string): Promise<string[]> {
    return urls;
  }

  /** Receipts / bills (images or PDF). */
  async uploadDocument(file: Express.Multer.File, options?: { folder?: string }): Promise<string> {
    if (file.mimetype !== 'application/pdf') return this.uploadImage(file, { folder: options?.folder ?? 'documents' });
    return new Promise<string>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ folder: options?.folder ?? 'documents', resource_type: 'raw' }, (error, result) => {
        if (error) return reject(error);
        resolve(result!.secure_url);
      });
      stream.end(file.buffer);
    });
  }

  /** True for URLs this service stored (only these are deleted from Cloudinary). */
  ownsUrl(url: string): boolean {
    return url.includes('cloudinary.com');
  }
}

// IMAGE_STORAGE=local stores images on this server's disk (VPS); anything else keeps Cloudinary.
export const imageService =
  process.env.IMAGE_STORAGE === 'local' ? new LocalImageService() : new CloudinaryService();

