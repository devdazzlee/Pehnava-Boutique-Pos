"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalImageService = exports.UPLOADS_PUBLIC_URL = exports.UPLOADS_DIR = void 0;
exports.slugify = slugify;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const sharp_1 = __importDefault(require("sharp"));
// Images are stored on the server's disk and served by nginx from UPLOADS_PUBLIC_URL.
// New uploads land in tmp/ first (the product/category doesn't exist yet), then
// finalizeImage() renames them after the product/category name, e.g. products/ajwa-dates-2.jpg
exports.UPLOADS_DIR = path_1.default.resolve(process.env.UPLOADS_DIR || path_1.default.join(process.cwd(), 'uploads'));
exports.UPLOADS_PUBLIC_URL = (process.env.UPLOADS_PUBLIC_URL || '/uploads').replace(/\/+$/, '');
const TMP_FOLDER = 'tmp';
const MAX_SIZE = 1200;
function slugify(value) {
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
async function writeUnique(dir, base, ext, data) {
    await promises_1.default.mkdir(dir, { recursive: true });
    for (let n = 1;; n++) {
        const name = n === 1 ? `${base}.${ext}` : `${base}-${n}.${ext}`;
        try {
            await promises_1.default.writeFile(path_1.default.join(dir, name), data, { flag: 'wx' });
            return name;
        }
        catch (err) {
            if (err.code !== 'EEXIST')
                throw err;
        }
    }
}
/** Resize to max 1200px (like the old Cloudinary transformation), keeping the format. */
async function normalizeImage(buffer) {
    const meta = await (0, sharp_1.default)(buffer, { failOn: 'none' }).metadata();
    if (meta.format === 'gif')
        return { data: buffer, ext: 'gif' };
    const pipeline = (0, sharp_1.default)(buffer, { failOn: 'none' })
        .rotate()
        .resize({ width: MAX_SIZE, height: MAX_SIZE, fit: 'inside', withoutEnlargement: true });
    if (meta.format === 'png')
        return { data: await pipeline.png({ compressionLevel: 9 }).toBuffer(), ext: 'png' };
    if (meta.format === 'webp')
        return { data: await pipeline.webp({ quality: 85 }).toBuffer(), ext: 'webp' };
    return { data: await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer(), ext: 'jpg' };
}
function urlToPath(url) {
    if (!url.startsWith(`${exports.UPLOADS_PUBLIC_URL}/`))
        return null;
    const rel = decodeURIComponent(url.slice(exports.UPLOADS_PUBLIC_URL.length + 1));
    const full = path_1.default.resolve(exports.UPLOADS_DIR, rel);
    return full.startsWith(exports.UPLOADS_DIR + path_1.default.sep) ? full : null;
}
class LocalImageService {
    async saveTemp(buffer, originalName = 'image') {
        const { data, ext } = await normalizeImage(buffer);
        const base = `${slugify(path_1.default.parse(originalName).name)}-${crypto_1.default.randomBytes(4).toString('hex')}`;
        const name = await writeUnique(path_1.default.join(exports.UPLOADS_DIR, TMP_FOLDER), base, ext, data);
        return `${exports.UPLOADS_PUBLIC_URL}/${TMP_FOLDER}/${name}`;
    }
    async uploadImage(file, _options) {
        const url = await this.saveTemp(file.buffer, file.originalname);
        console.log(`Local image upload successful: ${url}`);
        return url;
    }
    async uploadBase64Image(base64Data) {
        const b64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
        return this.saveTemp(Buffer.from(b64, 'base64'));
    }
    async uploadMultipleImages(files, options) {
        const results = [];
        for (const file of files)
            results.push(await this.uploadImage(file, options));
        return results;
    }
    async uploadMultipleBase64Images(base64Images) {
        const results = [];
        for (const b64 of base64Images)
            results.push(await this.uploadBase64Image(b64));
        return results;
    }
    /** Moves a tmp upload to <folder>/<name-slug>[-n].<ext>. Other URLs are returned unchanged. */
    async finalizeImage(url, folder, name) {
        const src = urlToPath(url);
        if (!src || path_1.default.basename(path_1.default.dirname(src)) !== TMP_FOLDER)
            return url;
        try {
            const data = await promises_1.default.readFile(src);
            const ext = path_1.default.extname(src).slice(1) || 'jpg';
            const fileName = await writeUnique(path_1.default.join(exports.UPLOADS_DIR, folder), slugify(name), ext, data);
            await promises_1.default.unlink(src).catch(() => undefined);
            return `${exports.UPLOADS_PUBLIC_URL}/${folder}/${fileName}`;
        }
        catch (error) {
            console.log('Local image finalize failed:', error);
            return url;
        }
    }
    async finalizeImages(urls, folder, name) {
        const results = [];
        for (const url of urls)
            results.push(await this.finalizeImage(url, folder, name));
        return results;
    }
    /** True for URLs this service stored (only these are deleted from disk). */
    ownsUrl(url) {
        return urlToPath(url) !== null;
    }
    async deleteImage(imageUrl) {
        const file = urlToPath(imageUrl);
        if (!file)
            return;
        try {
            await promises_1.default.unlink(file);
            console.log(`Local image deleted: ${file}`);
        }
        catch (error) {
            console.log('Local image delete failed:', error);
        }
    }
    async deleteMultipleImages(imageUrls) {
        await Promise.all(imageUrls.map(url => this.deleteImage(url)));
    }
}
exports.LocalImageService = LocalImageService;
//# sourceMappingURL=localImageService.js.map