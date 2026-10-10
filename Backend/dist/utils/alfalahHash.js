"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptAlfalahRequestHash = encryptAlfalahRequestHash;
exports.buildAlfalahMapString = buildAlfalahMapString;
exports.hashAlfalahFields = hashAlfalahFields;
const crypto_1 = __importDefault(require("crypto"));
/**
 * APG RequestHash: AES/CBC/PKCS7 with Key1 as the 128-bit key and Key2 as IV.
 * Matches the CryptoJS sample in the Bank Alfalah APG Merchant Integration Guide v1.1.
 */
function encryptAlfalahRequestHash(mapString, key1, key2) {
    const key = Buffer.from(key1, 'utf8');
    const iv = Buffer.from(key2, 'utf8');
    if (key.length !== 16 || iv.length !== 16) {
        throw new Error(`Alfalah Key1 and Key2 must be 16 characters (AES-128). Received Key1=${key.length}, Key2=${iv.length}.`);
    }
    const cipher = crypto_1.default.createCipheriv('aes-128-cbc', key, iv);
    const encrypted = Buffer.concat([cipher.update(mapString, 'utf8'), cipher.final()]);
    return encrypted.toString('base64');
}
function buildAlfalahMapString(fields) {
    return Object.entries(fields)
        .filter(([name, value]) => Boolean(name) && value !== undefined && value !== null)
        .map(([name, value]) => `${name}=${value}`)
        .join('&');
}
function hashAlfalahFields(fields, key1, key2) {
    return encryptAlfalahRequestHash(buildAlfalahMapString(fields), key1, key2);
}
//# sourceMappingURL=alfalahHash.js.map