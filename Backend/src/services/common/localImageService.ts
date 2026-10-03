import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';

// Images are stored on the server's disk and served by nginx from UPLOADS_PUBLIC_URL.
// New uploads land in tmp/ first (the product/category doesn't exist yet), then
// finalizeImage() renames them after the product/category name, e.g. products/ajwa-dates-2.jpg
export const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads'));
export const UPLOADS_PUBLIC_URL = (process.env.UPLOADS_PUBLIC_URL || '/uploads').replace(/\/+$/, '');

const TMP_FOLDER = 'tmp';
const MAX_SIZE = 1200;

export function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
  return slug || 'image';
}

/** Creates <dir>/<base>.<ext>, or <base>-2.<ext>, <base>-3.<ext>... if taken. Returns the file name. */
async function writeUnique(dir: string, base: string, ext: string, data: Buffer): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  for (let n = 1; ; n++) {
    const name = n === 1 ? `${base}.${ext}` : `${base}-${n}.${ext}`;
    try {
      await fs.writeFile(path.join(dir, name), data, { flag: 'wx' });
      return name;
    } catch (err: any) {
      if (err.code !== 'EEXIST') throw err;
    }
  }
}

/** Resize to max 1200px (like the old Cloudinary transformation), keeping the format. */
async function normalizeImage(buffer: Buffer): Promise<{ data: Buffer; ext: string }> {
  const meta = await sharp(buffer, { failOn: 'none' }).metadata();
  if (meta.format === 'gif') return { data: buffer, ext: 'gif' };

  const pipeline = sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize({ width: MAX_SIZE, height: MAX_SIZE, fit: 'inside', withoutEnlargement: true });

  if (meta.format === 'png') return { data: await pipeline.png({ compressionLevel: 9 }).toBuffer(), ext: 'png' };
  if (meta.format === 'webp') return { data: await pipeline.webp({ quality: 85 }).toBuffer(), ext: 'webp' };
  return { data: await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer(), ext: 'jpg' };
}

function urlToPath(url: string): string | null {
  if (!url.startsWith(`${UPLOADS_PUBLIC_URL}/`)) return null;
  const rel = decodeURIComponent(url.slice(UPLOADS_PUBLIC_URL.length + 1));
  const full = path.resolve(UPLOADS_DIR, rel);
  return full.startsWith(UPLOADS_DIR + path.sep) ? full : null;
}

export class LocalImageService {
  private async saveTemp(buffer: Buffer, originalName = 'image'): Promise<string> {
    const { data, ext } = await normalizeImage(buffer);
    const base = `${slugify(path.parse(originalName).name)}-${crypto.randomBytes(4).toString('hex')}`;
    const name = await writeUnique(path.join(UPLOADS_DIR, TMP_FOLDER), base, ext, data);
    return `${UPLOADS_PUBLIC_URL}/${TMP_FOLDER}/${name}`;
  }

  async uploadImage(file: Express.Multer.File, _options?: { folder?: string }): Promise<string> {
    const url = await this.saveTemp(file.buffer, file.originalname);
    console.log(`Local image upload successful: ${url}`);
    return url;
  }

  /** Receipts / bills: images are resized like other uploads, PDFs are stored as-is. */
  async uploadDocument(file: Express.Multer.File, options?: { folder?: string }): Promise<string> {
    const folder = slugify(options?.folder || 'documents');
    if (file.mimetype !== 'application/pdf') {
      const { data, ext } = await normalizeImage(file.buffer);
      const name = await writeUnique(path.join(UPLOADS_DIR, folder), `${slugify(path.parse(file.originalname || 'receipt').name)}-${crypto.randomBytes(4).toString('hex')}`, ext, data);
      return `${UPLOADS_PUBLIC_URL}/${folder}/${name}`;
    }
    const name = await writeUnique(path.join(UPLOADS_DIR, folder), `${slugify(path.parse(file.originalname || 'receipt').name)}-${crypto.randomBytes(4).toString('hex')}`, 'pdf', file.buffer);
    return `${UPLOADS_PUBLIC_URL}/${folder}/${name}`;
  }

  async uploadBase64Image(base64Data: string): Promise<string> {
    const b64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    return this.saveTemp(Buffer.from(b64, 'base64'));
  }

  async uploadMultipleImages(files: Express.Multer.File[], options?: { folder?: string }): Promise<string[]> {
    const results: string[] = [];
    for (const file of files) results.push(await this.uploadImage(file, options));
    return results;
  }

  async uploadMultipleBase64Images(base64Images: string[]): Promise<string[]> {
    const results: string[] = [];
    for (const b64 of base64Images) results.push(await this.uploadBase64Image(b64));
    return results;
  }

  /** Moves a tmp upload to <folder>/<name-slug>[-n].<ext>. Other URLs are returned unchanged. */
  async finalizeImage(url: string, folder: string, name: string): Promise<string> {
    const src = urlToPath(url);
    if (!src || path.basename(path.dirname(src)) !== TMP_FOLDER) return url;
    try {
      const data = await fs.readFile(src);
      const ext = path.extname(src).slice(1) || 'jpg';
      const fileName = await writeUnique(path.join(UPLOADS_DIR, folder), slugify(name), ext, data);
      await fs.unlink(src).catch(() => undefined);
      return `${UPLOADS_PUBLIC_URL}/${folder}/${fileName}`;
    } catch (error) {
      console.log('Local image finalize failed:', error);
      return url;
    }
  }

  async finalizeImages(urls: string[], folder: string, name: string): Promise<string[]> {
    const results: string[] = [];
    for (const url of urls) results.push(await this.finalizeImage(url, folder, name));
    return results;
  }

  /** True for URLs this service stored (only these are deleted from disk). */
  ownsUrl(url: string): boolean {
    return urlToPath(url) !== null;
  }

  async deleteImage(imageUrl: string): Promise<void> {
    const file = urlToPath(imageUrl);
    if (!file) return;
    try {
      await fs.unlink(file);
      console.log(`Local image deleted: ${file}`);
    } catch (error) {
      console.log('Local image delete failed:', error);
    }
  }

  async deleteMultipleImages(imageUrls: string[]): Promise<void> {
    await Promise.all(imageUrls.map(url => this.deleteImage(url)));
  }
}
