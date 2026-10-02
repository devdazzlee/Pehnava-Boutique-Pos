"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.printZebraLabelsZPL = printZebraLabelsZPL;
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const shortDate = (iso) => {
    if (!iso)
        return '__/__/____';
    try {
        return new Date(iso).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }
    catch {
        return '__/__/____';
    }
};
/**
 * Generate ZPL for 3x2 inch labels (76.2mm x 50.8mm at 203 DPI)
 * Layout: Text on LEFT (45%), Barcode on RIGHT (55%) - HORIZONTAL
 * This matches your printer settings: 3" WIDE x 2" TALL in PORTRAIT
 */
function generateZPL3x2(item) {
    // 3" x 2" at 203 DPI: 609 dots wide x 406 dots tall
    const LABEL_WIDTH = 609;
    const LABEL_HEIGHT = 406;
    // Left section: ~45% for text
    const LEFT_SECTION = 270;
    const RIGHT_SECTION_X = 285; // Barcode starts here
    // Clean and format text
    const title = (item.name || '').toUpperCase().trim().substring(0, 30);
    const weight = item.netWeight ? `NET WT: ${item.netWeight}` : '';
    const price = Number.isFinite(item.price) ? `RS ${Math.round(item.price)}` : '';
    const pkg = `PKG: ${shortDate(item.packageDateISO)}`;
    const exp = `EXP: ${shortDate(item.expiryDateISO)}`;
    // ZPL for 3x2 inch horizontal layout
    // Position coordinates: ^FOX,Y where X=horizontal, Y=vertical from top-left
    return `^XA
^CI28
^PW${LABEL_WIDTH}
^LL${LABEL_HEIGHT}
^LH0,0
^FWN

REM === LEFT SECTION: TEXT (45%) ===
^CF0,32
^FO20,25^FB${LEFT_SECTION - 40},2,0,L^FD${title}^FS

^CF0,24
^FO20,75^FD${weight}^FS

^CF0,26
^FO20,110^FD${price}^FS

^CF0,22
^FO20,150^FD${pkg}^FS

^FO20,180^FD${exp}^FS

REM === RIGHT SECTION: BARCODE (55%) ===
^BY3,3,90
^FO${RIGHT_SECTION_X},100^BCN,90,Y,N,N
^FD${item.barcode}^FS

^XZ`;
}
/**
 * Send ZPL directly to Zebra printer
 */
async function sendZPLToPrinter(printerName, zpl) {
    const tmpFile = path_1.default.join(os_1.default.tmpdir(), `zebra_${Date.now()}.zpl`);
    try {
        // Write ZPL to temp file
        await fs_1.default.promises.writeFile(tmpFile, zpl, 'utf8');
        // Send to printer using Windows RAW printing
        // Method 1: Try COPY command for UNC path
        try {
            const uncPath = `\\\\localhost\\${printerName}`;
            await execFileAsync('cmd.exe', ['/c', 'copy', '/b', tmpFile, uncPath], {
                windowsHide: true,
                timeout: 10000
            });
            return;
        }
        catch {
            // Fallback to PRINT command
        }
        // Method 2: Use PRINT command
        await execFileAsync('print', ['/D:' + `"${printerName}"`, tmpFile], {
            windowsHide: true,
            timeout: 10000
        });
    }
    finally {
        // Cleanup
        fs_1.default.promises.unlink(tmpFile).catch(() => { });
    }
}
/**
 * Print labels using ZPL (Zebra Programming Language)
 * This is the PROPER way to print to Zebra printers
 */
async function printZebraLabelsZPL(printerName, items, copies = 1) {
    try {
        if (!items || items.length === 0) {
            return { success: false, message: 'No items to print' };
        }
        // Generate ZPL for all items
        let zpl = '';
        for (const item of items) {
            const itemZPL = generateZPL3x2(item);
            zpl += itemZPL + '\n';
            // Add copies
            if (copies > 1) {
                for (let i = 1; i < copies; i++) {
                    zpl += itemZPL + '\n';
                }
            }
        }
        // Send to printer
        await sendZPLToPrinter(printerName, zpl);
        return { success: true, message: `Printed ${items.length} label(s)` };
    }
    catch (error) {
        return {
            success: false,
            message: error?.message || 'Failed to print labels'
        };
    }
}
//# sourceMappingURL=zebra-labels.service.js.map