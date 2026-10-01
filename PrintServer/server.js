const express = require('express');
const cors = require('cors');
const fs = require('fs');
const os = require('os');
const path = require('path');
const PDFDocument = require('pdfkit');
const { print } = require('pdf-to-printer');
const bwipjs = require('bwip-js');

const app = express();
const PORT = 3001; // Local print server port

// Resolve logo path - handle both src and dist directories (same as backend)
const logoPath = fs.existsSync(path.join(__dirname, '../Frontend/public/Printserver-logo.png'))
  ? path.resolve(__dirname, '../Frontend/public/Printserver-logo.png')
  : fs.existsSync(path.join(__dirname, 'Printserver-logo.png'))
    ? path.resolve(__dirname, 'Printserver-logo.png')
    : null;

if (logoPath) {
  console.log('Logo path resolved to:', logoPath);
} else {
  console.log('No logo found - receipts will print without logo');
}

// CORS configuration - allow requests from Vercel frontend and localhost
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    // Allow requests from Vercel frontend domain
    const allowedOrigins = [
      'https://pos.manpasandstore.com',
      'https://manpasand-pos-beta.vercel.app',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001'
    ];

    // Check if origin is in allowed list or contains vercel.app
    if (allowedOrigins.includes(origin) || origin.includes('.vercel.app')) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(null, true); // Allow anyway for development (can restrict in production)
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Helper functions (same as backend)
function mm(n) {
  return n * 2.83464567;
}

function money(n) {
  return Number(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    printerInitialized: true, // We'll check on actual print
    timestamp: new Date().toISOString()
  });
});

// Helper functions for printer detection (same as backend)
const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Get printers via PowerShell CIM (Windows) - same as backend
async function getPrintersViaCIM() {
  const ps = [
    '-NoProfile',
    '-Command',
    `$p = Get-CimInstance Win32_Printer | Select-Object Name,Default,WorkOffline,PrinterStatus,DriverName,PortName,ServerName,ShareName;
     $p | ConvertTo-Json -Compress -Depth 3`
  ];
  const { stdout } = await execFileAsync('powershell', ps, {
    timeout: 5000,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024
  });
  const data = safeParseJson(stdout);
  if (!data) return [];

  const items = Array.isArray(data) ? data : [data];
  return items.map((p) => ({
    name: p.Name,
    id: `${String(p.Name).toLowerCase().replace(/\s+/g, '-')}@${process.env.COMPUTERNAME || 'local'}`,
    isDefault: !!p.Default,
    status: p.WorkOffline ? 'offline' : ((p.PrinterStatus === 3 || p.PrinterStatus === 0 || p.PrinterStatus == null) ? 'available' : 'unknown'),
    workOffline: !!p.WorkOffline,
    printerStatus: p.PrinterStatus ?? null,
    serverName: p.ServerName ?? null,
    shareName: p.ShareName ?? null,
    driver: { name: p.DriverName ?? null, version: null, manufacturer: null },
    port: { name: p.PortName ?? null, host: null },
    defaults: null
  }));
}

// Get printers via Get-Printer (Windows) - same as backend
async function getPrintersViaGetPrinter() {
  const ps = [
    '-NoProfile',
    '-Command',
    `$p = Get-Printer | Select-Object Name, PrinterStatus, WorkOffline;
     $p | ConvertTo-Json -Compress -Depth 3`
  ];
  const { stdout } = await execFileAsync('powershell', ps, {
    timeout: 5000,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024
  });
  const data = safeParseJson(stdout);
  if (!data) return [];
  const items = Array.isArray(data) ? data : [data];
  return items.map((p) => ({
    name: p.Name,
    isDefault: false,
    status: p.WorkOffline ? 'offline' : ((p.PrinterStatus === 3 || p.PrinterStatus === 0 || p.PrinterStatus == null) ? 'available' : 'unknown')
  }));
}

// Get default printer from registry (Windows) - same as backend
async function getDefaultPrinterFromRegistryHKCU() {
  const cmd = [
    'reg',
    'query',
    'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows',
    '/v',
    'Device'
  ];
  const { stdout } = await execFileAsync(cmd[0], cmd.slice(1), {
    timeout: 4000,
    windowsHide: true
  });
  const line = stdout.split(/\r?\n/).find(l => l.includes('REG_SZ'));
  if (!line) return null;
  const val = line.split('REG_SZ').pop()?.trim() || '';
  const name = val.split(',')[0]?.trim() || null;
  return name || null;
}

// Normalize and sort printers - same as backend
function normalizeAndSort(printers, defaultName = null) {
  const map = new Map();
  for (const p of printers) {
    const key = p.name.trim();
    const prev = map.get(key);
    map.set(key, {
      ...prev,
      ...p,
      isDefault: p.isDefault || prev?.isDefault || (defaultName ? key === defaultName : false)
    });
  }
  const list = Array.from(map.values());
  list.sort((a, b) => (Number(b.isDefault) - Number(a.isDefault)) || a.name.localeCompare(b.name));
  return list;
}

// Derive language hint - same as backend
function deriveLanguageHint(p) {
  const s = `${p.driver?.name || ''} ${p.name || ''}`.toLowerCase();
  if (s.includes('zebra') || s.includes('zdesigner')) return 'zpl';
  if (s.includes('generic') || s.includes('escpos') || s.includes('blackcopper') || s.includes('80mm') || s.includes('58mm')) return 'escpos';
  return 'generic';
}

// Windows ships a handful of virtual "printers" (Print to PDF, XPS Writer,
// Fax, OneNote) that are not real output devices. Sending a job to any of
// them makes Windows pop up a native "Save As" dialog on the server machine
// for every single print — there is no supported way to suppress it. Never
// let these be selectable as the receipt printer.
const VIRTUAL_PRINTER_PATTERNS = [
  /microsoft print to pdf/i,
  /microsoft xps document writer/i,
  /^fax$/i,
  /onenote/i,
];
const isVirtualPrinter = (name) => VIRTUAL_PRINTER_PATTERNS.some((re) => re.test(name || ''));

// Derive receipt profile - same as backend
function deriveReceiptProfile(p) {
  const w = p.defaults?.pageWidthMM ?? null;
  const name = (p.name || '').toLowerCase();
  const roll = (name.includes('80') || (w !== null && w >= 70)) ? '80mm' : '58mm';
  const printableWidthMM = roll === '80mm' ? 72 : 48;
  const columns = roll === '80mm' ? { fontA: 48, fontB: 64 } : { fontA: 32, fontB: 42 };
  return { roll, printableWidthMM, columns };
}

// Get available printers (same as backend) - Windows only for now
async function getAvailablePrinters() {
  const platform = process.platform;

  if (platform !== 'win32') {
    console.log(`Platform ${platform} not supported for printer detection`);
    return [];
  }

  try {
    let printers = [];

    // Try CIM first
    const cimPrinters = await getPrintersViaCIM().catch(() => []);
    if (cimPrinters.length) {
      printers = normalizeAndSort(cimPrinters);
    } else {
      // Fallback to Get-Printer
      const [gpPrintersRaw, defName] = await Promise.all([
        getPrintersViaGetPrinter().catch(() => []),
        getDefaultPrinterFromRegistryHKCU().catch(() => null)
      ]);
      const gpPrinters = gpPrintersRaw.map((p) => ({
        ...p,
        id: `${String(p.name).toLowerCase().replace(/\s+/g, '-')}@windows`
      }));
      if (gpPrinters.length) {
        printers = normalizeAndSort(gpPrinters, defName);
      }
    }

    // Add derived fields
    printers = printers.map(p => ({
      ...p,
      languageHint: deriveLanguageHint(p),
      receiptProfile: deriveReceiptProfile(p)
    }));

    // Drop virtual printers (Print to PDF, XPS, Fax, OneNote) — see
    // isVirtualPrinter for why these can never be a valid receipt printer.
    printers = printers.filter(p => !isVirtualPrinter(p.name));

    // Fallback to default if no printers found
    if (printers.length === 0) {
      console.log('No printers detected, returning default printer');
      return [{
        name: 'Default Printer',
        id: 'default@local',
        isDefault: true,
        status: 'available',
        languageHint: 'escpos',
        receiptProfile: { roll: '80mm', printableWidthMM: 72, columns: { fontA: 48, fontB: 64 } }
      }];
    }

    console.log(`Found ${printers.length} printers`);
    return printers;
  } catch (e) {
    console.error('Error getting printers:', e);
    return [{
      name: 'Default Printer',
      id: 'default@local',
      isDefault: true,
      status: 'available',
      languageHint: 'escpos',
      receiptProfile: { roll: '80mm', printableWidthMM: 72, columns: { fontA: 48, fontB: 64 } }
    }];
  }
}

// Get available printers endpoint (same format as backend)
app.get('/printers', async (req, res) => {
  try {
    const printers = await getAvailablePrinters();
    res.json({
      success: true,
      data: printers,
      message: 'Printers fetched successfully'
    });
  } catch (error) {
    console.error('Error getting printers:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      data: []
    });
  }
});

// Print receipt endpoint (using same PDF approach as backend)
app.post('/print-receipt', async (req, res) => {
  try {
    const { printer, job, receiptData } = req.body || {};

    if (!printer?.name || !receiptData) {
      return res.status(400).json({
        success: false,
        message: 'Missing printer.name or receiptData'
      });
    }

    const copies = job?.copies ?? 1;
    // Use logoPath from receiptData if provided, otherwise use default
    const logoToUse = receiptData.logoPath || logoPath;

    // Paper geometry (80mm roll) - same as backend
    const pageWidth = mm(72);
    const margins = {
      left: mm(1.0),
      right: mm(1.0),
      top: mm(4),
      bottom: mm(5)
    };
    const W = pageWidth - margins.left - margins.right;

    // PDF init - start with reasonable height, will be trimmed later
    const tmp = path.join(os.tmpdir(), `receipt_${Date.now()}.pdf`);
    const doc = new PDFDocument({
      size: [pageWidth, mm(1800)],
      margins,
      autoFirstPage: true,
      pdfVersion: '1.4'
    });
    const stream = fs.createWriteStream(tmp);
    doc.pipe(stream);

    // Fonts: use Helvetica-Bold (same as backend)
    const baseFont = 'Helvetica-Bold';
    const boldFont = 'Helvetica-Bold';
    doc.fillColor('#000').strokeColor('#000').opacity(1);

    // Faux-bold via glyph stroking (ROOT-CAUSE fix for light thermal text):
    // SumatraPDF anti-aliases text, so thin strokes become gray pixels that the
    // thermal driver dithers into sparse dots -> faded/broken look. We render
    // every glyph as fill + a stroked outline, which physically thickens each
    // stroke by ~BOLD_STROKE so the center stays solid black after AA.
    // (A sub-pixel positional offset is useless here: <1 printer dot rounds away.)
    const BOLD_STROKE = 0.25; // pt of outline added around each glyph (~0.7 dot @203dpi)
    const _origText = doc.text.bind(doc);
    doc.text = function (text, x, y, options) {
      // Match stroke colour to fill so the outline is also pure black.
      doc.lineWidth(BOLD_STROKE);
      const opts = Object.assign({ fill: true, stroke: true }, options);
      return _origText(text, x, y, opts);
    };

    // Global sizes (same as backend)
    // Minimums raised: below ~8pt at 203 DPI strokes are too thin and fade first.
    const BODY_MAX = 9.4;
    const BODY_MIN = 8.0;
    const TOTAL_MAX = 11.2;
    const TOTAL_MIN = 8.6;
    const HEAD_MAX = 16;

    doc.font(baseFont).fontSize(BODY_MAX);

    // Util: single-line height for current font size
    const lineH = (size) => {
      doc.fontSize(size);
      return Math.ceil(doc.heightOfString('Ag')) + 2;
    };

    // Fit a text into a width by shrinking font down to min
    function drawFit(text, x, y, width, opts) {
      const font = opts.font || baseFont;
      let size = opts.maxSize;
      doc.font(font);
      const absoluteMin = Math.max(6, opts.minSize * 0.85);
      let textWidth = 0;

      // Shrink to fit
      while (size > absoluteMin) {
        doc.fontSize(size);
        textWidth = doc.widthOfString(text, { characterSpacing: 0 });
        if (textWidth <= width) break;
        size -= 0.1;
      }

      // Always draw without width constraint to prevent clipping
      doc.font(font).fontSize(size);
      textWidth = doc.widthOfString(text, { characterSpacing: 0 });

      let drawX = x;
      if (opts.align === 'right') {
        drawX = x + width - textWidth;
      } else if (opts.align === 'center') {
        drawX = x + (width - textWidth) / 2;
      }

      doc.text(text, drawX, y, { lineBreak: false });
      return size;
    }

    // Draw a two-column row (left label, right value)
    function rowLR(label, value, y, opts) {
      const LBL_W = W * 0.45;
      const maxSize = opts?.maxSize ?? BODY_MAX;
      const minSize = opts?.minSize ?? BODY_MIN;
      const font = opts?.bold ? boldFont : baseFont;

      // Left label
      doc.font(font);
      let sizeL = maxSize;
      doc.fontSize(sizeL);
      while (sizeL > minSize && doc.widthOfString(label) > LBL_W) {
        sizeL -= 0.2;
        doc.fontSize(sizeL);
      }
      doc.fontSize(sizeL);
      doc.text(label, margins.left, y, { lineBreak: false });

      // Right value - NO WIDTH CONSTRAINT
      doc.font(font);
      doc.fontSize(maxSize);
      let sizeR = maxSize;
      doc.fontSize(sizeR);
      let checkWidth = doc.widthOfString(value);
      if (checkWidth > W * 0.7) {
        while (sizeR > 8 && checkWidth > W * 0.7) {
          sizeR -= 0.2;
          doc.fontSize(sizeR);
          checkWidth = doc.widthOfString(value);
        }
      }
      doc.fontSize(sizeR);
      const finalValueWidth = doc.widthOfString(value);
      doc.text(value, margins.left + W - finalValueWidth, y, { lineBreak: false });

      const used = Math.min(sizeL, sizeR);
      return lineH(used);
    }

    // Three-column row (ITEM | QTY | RATE)
    function rowIQR(item, qty, rate, y, opts) {
      const maxSize = opts?.header ? TOTAL_MAX : BODY_MAX;
      const minSize = opts?.header ? TOTAL_MIN : BODY_MIN;
      const font = opts?.header ? boldFont : baseFont;

      const itemW = opts?.header ? W * 0.48 : W * 0.50;
      const qtyW = opts?.header ? W * 0.18 : W * 0.16;
      const rateW = W - (itemW + qtyW);

      const X_ITEM = margins.left;
      const X_QTY = X_ITEM + itemW;
      const X_RATE = X_QTY + qtyW;

      doc.font(font);

      // ITEM - left aligned
      const sizeItem = drawFit(item, X_ITEM, y, itemW, {
        maxSize,
        minSize,
        align: 'left',
        font
      });

      // QTY - center aligned
      const sizeQty = drawFit(qty, X_QTY, y, qtyW, {
        maxSize,
        minSize,
        align: 'center',
        font
      });

      // RATE - right aligned
      const sizeRate = drawFit(rate, X_RATE, y, rateW, {
        maxSize,
        minSize,
        align: 'right',
        font
      });

      const used = Math.min(sizeItem, sizeQty, sizeRate);
      return lineH(used);
    }

    function hr(y, style = 'dotted', thick = 1) {
      const yy = y + 1;
      if (style === 'dotted') doc.dash(1, { space: 2 });
      else doc.undash();
      doc.moveTo(margins.left, yy)
        .lineTo(margins.left + W, yy)
        .lineWidth(thick)
        .stroke();
      doc.undash();
      return yy + 3 - y;
    }

    const normalizeReceiptAddress = (address) => {
      const normalized = typeof address === 'string' ? address.trim() : '';

      if (!normalized) {
        return 'G-1, Soldier Bazar, Karachi';
      }

      if (/pakistan/i.test(normalized)) {
        return normalized;
      }

      if (/karachi/i.test(normalized)) {
        return `${normalized}, Pakistan`;
      }

      return `${normalized}, Karachi, Pakistan`;
    };

    const buildReceiptBranchLine = (storeName, address) => {
      const rawStoreName =
        typeof storeName === 'string' ? storeName.trim() : '';
      // Drop the literal word "Branch" — customers already know it's a branch,
      // and keeping it both reads awkwardly and duplicates the area name that
      // is already present in the address (e.g. "Bahadurabad Branch, Bahadurabad").
      const normalizedStoreName = rawStoreName
        .replace(/\bbranch\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/[\s,]+$/g, '')
        .trim();
      const normalizedAddress = normalizeReceiptAddress(address);

      if (
        !normalizedStoreName ||
        ['ADMIN', 'MANPASAND GENERAL STORE', 'PEHNAWA BOUTIQUE'].includes(
          normalizedStoreName.toUpperCase()
        )
      ) {
        return normalizedAddress;
      }

      if (
        normalizedAddress
          .toLowerCase()
          .includes(normalizedStoreName.toLowerCase())
      ) {
        return normalizedAddress;
      }

      return `${normalizedStoreName}, ${normalizedAddress}`;
    };

    // ===== HEADER =====
    let y = margins.top;

    // Wide wordmark. Size the box to the printable width and advance by the
    // fitted height so a short logo does not leave a large blank gap.
    if (logoToUse && fs.existsSync(logoToUse)) {
      const maxW = Math.min(mm(62), W);
      const maxH = mm(16);
      const x = (pageWidth - maxW) / 2;
      doc.save();
      doc.image(logoToUse, x, y, { fit: [maxW, maxH], align: 'center', valign: 'center' });
      doc.restore();
      y += maxH + mm(2);
    }

    // Address + Tagline
    doc.font(boldFont);
    const branchAddress = buildReceiptBranchLine(
      receiptData.storeName,
      receiptData.address
    );
    const usedAddrTop = drawFit(branchAddress, margins.left, y, W, {
      maxSize: 11,
      minSize: 8.5,
      align: 'center',
      font: boldFont
    });
    y += lineH(usedAddrTop) * 0.9;

    doc.font(baseFont);
    const tg = receiptData.tagline || 'Elegance, crafted for every moment.';
    const usedTg = drawFit(tg, margins.left, y, W, {
      maxSize: BODY_MAX,
      minSize: BODY_MIN,
      align: 'center'
    });
    y += lineH(usedTg) - 2;

    if (receiptData.documentTitle) {
      const usedDoc = drawFit(String(receiptData.documentTitle), margins.left, y, W, {
        maxSize: 11,
        minSize: 9,
        align: 'center',
        font: boldFont
      });
      y += lineH(usedDoc) - 1;
    }

    if (receiptData.strn) {
      const usedStrn = drawFit(receiptData.strn, margins.left, y, W, {
        maxSize: BODY_MAX,
        minSize: BODY_MIN,
        align: 'center'
      });
      y += lineH(usedStrn) - 2;
    }

    y += hr(y, 'dotted');

    // ===== META =====
    const when = new Date(receiptData.timestamp || Date.now());
    const lh1 = rowLR('Receipt #', String(receiptData.transactionId), y);
    y += lh1;

    if (receiptData.originalSaleNumber) {
      const lhOrig = rowLR('Original sale', String(receiptData.originalSaleNumber), y);
      y += lhOrig;
    }

    const lh2 = rowLR(
      'Date',
      `${when.toLocaleDateString()} ${when.toLocaleTimeString()}`,
      y
    );
    y += lh2;

    // Cashier | Customer
    const rawCashier =
      typeof receiptData.cashier === 'string' ? receiptData.cashier.trim() : '';
    const customerType = receiptData.customerType || 'Walk-in';
    // Only show Cashier when a real employee name is provided. "Walk-in" is a
    // customer type, not a cashier, so showing it here is meaningless.
    if (rawCashier && rawCashier.toLowerCase() !== 'walk-in') {
      y += rowLR('Cashier', rawCashier, y);
    }
    const lh4 = rowLR('Customer', customerType, y);
    y += lh4 + 2;

    y += hr(y, 'dotted');

    // Column widths shared by header + rows so they line up cleanly.
    // QTY must fit strings like "0.01 Kg" / "0.67 Kg" on one line (old receipts
    // only needed "1 Kg", which is why the same server looked fine before).
    const itemColW = W * 0.50;
    const qtyColW = W * 0.22;
    const rateColW = W - itemColW - qtyColW;
    const X_ITEM_C = margins.left;
    const X_QTY_C = X_ITEM_C + itemColW;
    const X_RATE_C = X_QTY_C + qtyColW;

    // ===== ITEMS HEADER =====
    doc.font(boldFont).fontSize(TOTAL_MAX);
    doc.text('ITEM', X_ITEM_C, y, { width: itemColW, align: 'left', lineBreak: false });
    doc.text('QTY', X_QTY_C, y, { width: qtyColW, align: 'right', lineBreak: false });
    doc.text('RATE', X_RATE_C, y, { width: rateColW, align: 'right', lineBreak: false });
    y += lineH(TOTAL_MAX);
    y += hr(y, 'solid', 1);
    y += 4;

    const formatItemRate = (it) => {
      const qtyNumber = Number(it.quantity || 0);
      const unitPrice = Number(
        it.sellingPrice ?? it.actualUnitPrice ?? it.price ?? 0
      );
      const lineAmount =
        it.lineTotal != null
          ? Math.abs(Number(it.lineTotal))
          : Math.abs(unitPrice * qtyNumber);
      return it.isCredit ? `- ${money(lineAmount)}` : money(lineAmount);
    };

    const printItemRow = (it) => {
      const name = String(it.name || '');
      const qtyNumber = Number(it.quantity || 0);
      const qtyText = Number.isInteger(qtyNumber)
        ? String(qtyNumber)
        : String(parseFloat(qtyNumber.toFixed(3)));
      const qty = qtyText + (it.unit ? ` ${it.unit}` : '');
      const rate = formatItemRate(it);

      doc.font(baseFont).fontSize(BODY_MAX);
      const itemH = doc.heightOfString(name, { width: itemColW });

      doc.text(name, X_ITEM_C, y, {
        width: itemColW,
        align: 'left',
      });
      // drawFit keeps "0.01 Kg" on ONE line (shrinks font). doc.text+width
      // wraps the unit under the number and overlaps with faux-bold strokes.
      drawFit(qty, X_QTY_C, y, qtyColW, {
        maxSize: BODY_MAX,
        minSize: BODY_MIN,
        align: 'right',
        font: baseFont,
      });
      drawFit(rate, X_RATE_C, y, rateColW, {
        maxSize: BODY_MAX,
        minSize: BODY_MIN,
        align: 'right',
        font: baseFont,
      });

      y += Math.max(itemH, lineH(BODY_MAX)) + 1;
    };

    const sections =
      Array.isArray(receiptData.itemSections) && receiptData.itemSections.length > 0
        ? receiptData.itemSections
        : [{ title: null, items: receiptData.items || [] }];

    for (const section of sections) {
      if (section.title) {
        doc.font(boldFont).fontSize(BODY_MAX);
        doc.text(String(section.title), X_ITEM_C, y, {
          width: W,
          align: 'left',
        });
        y += lineH(BODY_MAX);
      }
      for (const it of section.items || []) {
        printItemRow(it);
      }
    }

    y += 2;
    y += hr(y, 'dotted');

    if (Array.isArray(receiptData.summaryLines) && receiptData.summaryLines.length > 0) {
      for (const line of receiptData.summaryLines) {
        y += rowLR(String(line.label || ''), String(line.value || ''), y, {
          bold: !!line.emphasis,
          maxSize: line.emphasis ? TOTAL_MAX : BODY_MAX,
          minSize: line.emphasis ? TOTAL_MIN : BODY_MIN,
        });
      }
    } else {
      // ===== TOTALS (regular sale) =====
      const subtotal = Number(receiptData.subtotal || 0);
      const discount = Number(receiptData.discount || 0);
      const tax = receiptData.taxPercent
        ? (subtotal - discount) * (receiptData.taxPercent / 100)
        : 0;
      const total = receiptData.total ?? Math.max(0, subtotal - discount + tax);

      y += rowLR('Subtotal', `PKR ${money(subtotal)}`, y);
      if (receiptData.discount != null && receiptData.discount !== undefined && Number(receiptData.discount) > 0) {
        y += rowLR('Discount', `- PKR ${money(discount)}`, y);
      }

      y += rowLR('Grand Total', `PKR ${money(total)}`, y, {
        bold: true,
        maxSize: TOTAL_MAX,
        minSize: TOTAL_MIN
      });
      y += hr(y, 'dotted');

      const paymentMethod = String(receiptData.paymentMethod || 'CASH').toUpperCase();
      y += rowLR('Payment', paymentMethod, y);
      if (receiptData.amountPaid != null) {
        y += rowLR('Paid', `PKR ${money(receiptData.amountPaid)}`, y);
      }
      if (receiptData.changeAmount && receiptData.changeAmount > 0) {
        y += rowLR('Change', `PKR ${money(receiptData.changeAmount)}`, y);
      }
    }
    y += hr(y, 'dotted');

    // Optional notes
    if (receiptData.promo) {
      const used = drawFit(`Notes: ${receiptData.promo}`, margins.left, y, W, {
        maxSize: BODY_MAX,
        minSize: BODY_MIN,
        align: 'center'
      });
      y += lineH(used);
    }

    // ===== BARCODE =====
    if (receiptData.transactionId) {
      const png = await new Promise((resolve, reject) => {
        bwipjs.toBuffer(
          {
            bcid: 'code128',
            text: String(receiptData.transactionId),
            scale: 2,
            height: 10,
            includetext: false,
            backgroundcolor: 'FFFFFF',
            paddingwidth: 0,
            paddingheight: 0
          },
          (err, buf) => (err ? reject(err) : resolve(buf))
        );
      });
      const barW = mm(48);
      const barH = mm(14);
      const x = margins.left + (W - barW) / 2;
      doc.image(png, x, y + 2, { width: barW, height: barH });
      y += barH + 6;
      const used = drawFit(receiptData.transactionId, margins.left, y, W, {
        maxSize: 9.8,
        minSize: 8.0,
        align: 'center'
      });
      y += lineH(used);
    }

    // ===== FOOTER =====
    const usedTy = drawFit(
      receiptData.thankYouMessage || 'Thank you for shopping!',
      margins.left,
      y,
      W,
      { maxSize: 10.6, minSize: 8.6, align: 'center', font: boldFont }
    );
    y += lineH(usedTy) - 2;
    const footerLines = [
      'Call / WhatsApp: +92-333-2757629',
      'Website: pehnawastore.pk',
      'G-1, Soldier Bazar, Karachi'
    ];
    for (const line of footerLines) {
      const usedF = drawFit(line, margins.left, y, W, {
        maxSize: 9.8,
        minSize: 8.0,
        align: 'center'
      });
      y += lineH(usedF) - 1;
    }

    // Powered by credit (Ace Studios)
    y += hr(y, 'dotted', 0.5) + 3;

    const poweredBy = drawFit('Powered by Ace Studios', margins.left, y, W, {
      maxSize: 8.5,
      minSize: 7.0,
      align: 'center',
      font: baseFont
    });
    y += lineH(poweredBy) + 1;

    const aceLines = [
      'Website: acestudiosus.com | Contact: +92 336 2500357'
    ];
    for (const line of aceLines) {
      const usedAce = drawFit(line, margins.left, y, W, {
        maxSize: 8.0,
        minSize: 7.0,
        align: 'center',
        font: baseFont
      });
      y += lineH(usedAce) + 1;
    }

    // Trim height with safety buffer to avoid bottom cut (same as backend)
    // Increased buffer to ensure Ace Studios section is included
    const needed = y + margins.bottom + 30;
    if (needed < doc.page.height) {
      doc.page.height = needed;
    } else {
      // If content exceeds initial height, ensure we have enough space
      doc.page.height = needed + 20;
    }

    doc.end();
    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    // Print using pdf-to-printer (same as backend)
    for (let i = 0; i < copies; i++) {
      await print(tmp, { printer: printer.name, scale: 'noscale', monochrome: true });
    }

    // Cleanup
    fs.unlink(tmp, () => { });

    res.json({
      success: true,
      message: 'Receipt printed successfully',
      copies,
      printer: printer.name
    });
  } catch (error) {
    console.error('Print error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ZPL helper functions
function escapeZPL(text) {
  if (!text) return '';
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/\^/g, '\\^')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`');
}

function formatDateZPL(iso) {
  if (!iso) return '__/__/____';
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// Generate ZPL for 58mm x 40mm labels (landscape, horizontal barcode)
function generateZPLForLabel(item, options) {
  const { dpi, humanReadable } = options;
  
  // CORRECT DIMENSIONS: 58mm wide x 40mm tall (horizontal/landscape) - SAME AS PDF/BROWSER PRINT
  // 58mm x 40mm at 203 DPI: 58*203/25.4 = 464 dots wide, 40*203/25.4 = 320 dots tall
  // 58mm x 40mm at 300 DPI: 58*300/25.4 = 685 dots wide, 40*300/25.4 = 472 dots tall
  const width = Math.round((58 * dpi) / 25.4);   // 58mm wide (horizontal/landscape)
  const height = Math.round((40 * dpi) / 25.4);  // 40mm tall (horizontal/landscape)
  
  // Generous margins to prevent cutting on all printers
  const marginX = dpi === 300 ? 50 : 40;  // Left/Right margin (~4mm)
  const marginY = dpi === 300 ? 30 : 24;  // Top/Bottom margin (~3mm)
  const contentWidth = width - (marginX * 2);
  const startX = marginX;
  
  // Font sizes for horizontal layout
  const fontSizeLarge = dpi === 300 ? 18 : 16;   // Product name
  const fontSizeMedium = dpi === 300 ? 14 : 12;  // Weight/Price
  const fontSizeSmall = dpi === 300 ? 11 : 9;    // Dates
  
  // Y positions - horizontal layout
  let yPos = marginY;
  const lineHeight = dpi === 300 ? 18 : 15;
  const lineSpacing = dpi === 300 ? 2 : 1;
  
  // Product name
  const productName = escapeZPL((item.name || '').trim().toUpperCase());
  const titleY = yPos;
  
  // Barcode settings - horizontal layout
  const barcodeHeight = dpi === 300 ? 45 : 35;   // Barcode height
  const barcodeBarWidth = dpi === 300 ? 3 : 2;   // Module width
  
  // Use 95% of content width for text to prevent edge cutting
  const textWidth = Math.floor(contentWidth * 0.95);
  const textStartX = startX + Math.floor((contentWidth - textWidth) / 2);
  
  // Build ZPL - FINAL SOLUTION: Match browser print behavior
  // Browser print uses 58mm x 40mm and prints horizontally correctly
  // For ZPL: Use correct dimensions AND rotate 270° counter-clockwise (same as 90° clockwise)
  // This should achieve the same horizontal orientation as browser print
  let zpl = '^XA\n';  // Start label
  zpl += `^PW${width}\n`;  // Print width (58mm - same as PDF/browser print)
  zpl += `^LL${height}\n`; // Label length (40mm - same as PDF/browser print)
  zpl += `^LH0,0\n`;       // Label home position (0,0)
  zpl += `^CI28\n`;        // UTF-8 character set
  zpl += `^POB\n`;         // Print orientation: Rotate 270° counter-clockwise (makes it horizontal like browser print)
  
  // Product name - centered, allow 2 lines max for long names
  if (productName) {
    zpl += `^CF0,${fontSizeLarge}\n`;
    // ^FB: Field Block - wraps text, 2 lines max, centered
    zpl += `^FO${textStartX},${titleY}^FB${textWidth},2,0,C,0^FD${productName}^FS\n`;
  }
  
  // Calculate Y position after product name (account for possible 2-line wrap)
  let currentY = titleY + lineHeight + (lineSpacing * 2); // Space for product name
  
  // Meta row - Weight and Price (stacked vertically, compact)
  const netWeightText = item.netWeight ? `NET WT: ${escapeZPL(item.netWeight)}` : '';
  const priceText = (item.price !== undefined && item.price !== null) ? `RS ${Math.round(Number(item.price))}` : '';
  
  if (netWeightText || priceText) {
    zpl += `^CF0,${fontSizeMedium}\n`;
    if (netWeightText) {
      zpl += `^FO${textStartX},${currentY}^FD${escapeZPL(netWeightText)}^FS\n`;
      currentY += lineHeight + lineSpacing;
    }
    if (priceText) {
      zpl += `^FO${textStartX},${currentY}^FD${escapeZPL(priceText)}^FS\n`;
      currentY += lineHeight + lineSpacing;
    }
  }
  
  // Dates row - PKG and EXP (stacked vertically, compact)
  const pkgText = `PKG: ${formatDateZPL(item.packageDateISO)}`;
  const expText = `EXP: ${formatDateZPL(item.expiryDateISO)}`;
  
  zpl += `^CF0,${fontSizeSmall}\n`;
  zpl += `^FO${textStartX},${currentY}^FD${escapeZPL(pkgText)}^FS\n`;
  currentY += lineHeight + lineSpacing;
  zpl += `^FO${textStartX},${currentY}^FD${escapeZPL(expText)}^FS\n`;
  currentY += lineHeight + lineSpacing; // Spacing before barcode
  
  // Barcode - Code 128, adjusted for 40mm width constraint
  if (item.barcode) {
    // Set module width (bar width) - narrower for 40mm width
    zpl += `^BY${barcodeBarWidth}\n`;
    const hri = humanReadable ? 'Y' : 'N';
    
    // Calculate barcode area – use 80% of content width to stay within safe zone
    const barcodeAreaWidth = Math.floor(contentWidth * 0.80);
    const barcodeCenterX = startX + Math.floor((contentWidth - barcodeAreaWidth) / 2);
    
    // ^BCN: Code 128 barcode, Normal orientation
    // With swapped dimensions, barcode will print correctly (bars vertical, scannable)
    zpl += `^FO${barcodeCenterX},${currentY}^BCN,${barcodeHeight},${hri},N,N\n`;
    zpl += `^FD${escapeZPL(String(item.barcode))}^FS\n`;
  }
  
  zpl += '^XZ\n';  // End label
  return zpl;
}

// Send ZPL to printer using proper RAW printing (like backend)
async function sendZPLToPrinter(printerName, zpl) {
  const { exec, execFile } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);
  const execFileAsync = promisify(execFile);
  
  const tmpFile = path.join(os.tmpdir(), `zpl_${Date.now()}_${Math.random().toString(36).slice(2)}.zpl`);
  
  // Write ZPL to file
  fs.writeFileSync(tmpFile, zpl, 'utf8');
  console.log(`[ZPL] ZPL file saved to: ${tmpFile}`);
  console.log(`[ZPL] ZPL content (first 500 chars):\n${zpl.substring(0, 500)}...`);
  console.log(`[ZPL] ZPL content (last 200 chars):\n...${zpl.substring(zpl.length - 200)}`);
  
  // Try multiple printer name variations (in case one fails)
  const printerNameVariations = [
    printerName,  // Original name
    printerName.replace(/\s*\(EPL\)\s*/i, ''),  // Without (EPL)
    printerName.replace(/\s*\(ZPL\)\s*/i, ''),  // Without (ZPL)
  ].filter((name, index, self) => self.indexOf(name) === index); // Remove duplicates
  
  console.log(`[ZPL] Will try printer names: ${printerNameVariations.join(', ')}`);
  
  let success = false;
  let lastError = null;
  
  // Get printer port information using PowerShell (wmic is deprecated)
  let printerPort = null;
  let shareName = null;
  let workingPrinterName = null;
  
  // Try to get printer info for each variation
  for (const nameToTry of printerNameVariations) {
    try {
      // Use PowerShell to get printer info - use single quotes to avoid parsing issues
      const escapedName = nameToTry.replace(/'/g, "''");
      const psCommand = `Get-Printer -Name '${escapedName}' | Select-Object PortName,ShareName | ConvertTo-Json`;
      const { stdout } = await execAsync(`powershell -Command "${psCommand}"`, { windowsHide: true, timeout: 5000 });
      
      try {
        const printerInfo = JSON.parse(stdout);
        printerPort = printerInfo.PortName || printerInfo.portName || null;
        shareName = printerInfo.ShareName || printerInfo.shareName || null;
        if (printerPort === 'NULL' || !printerPort) printerPort = null;
        if (shareName === 'NULL' || !shareName) shareName = null;
        if (printerPort || shareName) {
          workingPrinterName = nameToTry;
          break; // Found working printer name
        }
      } catch (parseError) {
        // Try parsing as separate lines
        const lines = stdout.split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
          if (line.includes('PortName')) {
            const match = line.match(/PortName["\s:]+([^",\s]+)/i);
            if (match) {
              printerPort = match[1];
              workingPrinterName = nameToTry;
            }
          }
          if (line.includes('ShareName')) {
            const match = line.match(/ShareName["\s:]+([^",\s]+)/i);
            if (match) {
              shareName = match[1];
              workingPrinterName = nameToTry;
            }
          }
        }
        if (workingPrinterName) break;
      }
    } catch (error) {
      console.log(`[ZPL] Failed to get printer info for "${nameToTry}":`, error.message);
      continue; // Try next variation
    }
  }
  
  if (!workingPrinterName) {
    console.log('[ZPL] Could not find printer info, will try all name variations');
    workingPrinterName = printerName; // Fallback to original
  }
  
  console.log(`[ZPL] Using printer name: "${workingPrinterName}"`);
  console.log(`[ZPL] Printer Port: ${printerPort || 'Not found'}, Share: ${shareName || 'Not found'}`);
  
  if (!shareName) {
    // Try alternative: use printer name as share name
    shareName = workingPrinterName;
  }
  
  // Method 1: Direct port write (ONLY for COM/LPT - USB ports CANNOT use direct write)
  // Note: USB ports like USB001 are virtual and don't support direct file copy
  if (printerPort && !printerPort.startsWith('USB') && (printerPort.startsWith('COM') || printerPort.startsWith('LPT'))) {
    try {
      console.log(`[ZPL] Attempting direct write to port: ${printerPort}`);
      const { stdout } = await execAsync(`copy /b "${tmpFile}" "${printerPort}"`, { windowsHide: true, timeout: 10000 });
      if (stdout && stdout.includes('file(s) copied') && !stdout.includes('0 file')) {
        success = true;
        console.log(`[ZPL] ✅ Sent via direct port ${printerPort}`);
      } else {
        console.log(`[ZPL] Direct port write returned: ${stdout || 'no output'}`);
      }
    } catch (error) {
      console.log(`[ZPL] Direct port write failed:`, error.message);
      lastError = error;
    }
  } else if (printerPort && printerPort.startsWith('USB')) {
    console.log(`[ZPL] USB port detected (${printerPort}) - skipping direct write, will use .NET RawPrinterHelper`);
  }
  
  // Method 2: Use .NET RawPrinterHelper via PowerShell (BEST for USB and ZPL printers - try early)
  if (!success) {
    // Try each printer name variation
    for (const nameToTry of printerNameVariations) {
      if (success) break; // Already succeeded
      
      try {
        console.log(`[ZPL] Attempting .NET RawPrinterHelper with printer: "${nameToTry}"`);
        const psScriptFile = path.join(os.tmpdir(), `print_raw_${Date.now()}_${Math.random().toString(36).slice(2)}.ps1`);
        const psScript = `
$printerName = '${nameToTry.replace(/'/g, "''")}'
$filePath = '${tmpFile.replace(/\\/g, '\\\\').replace(/'/g, "''")}'

if (-not (Test-Path $filePath)) {
    Write-Host "ERROR: File not found: $filePath"
    exit 1
}

$fileContent = [System.IO.File]::ReadAllBytes($filePath)
Write-Host "Read $($fileContent.Length) bytes from file"

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
    [DllImport("winspool.drv", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string printerName, out IntPtr hPrinter, IntPtr printerDefaults);
    
    [DllImport("winspool.drv", SetLastError = true, ExactSpelling = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, [MarshalAs(UnmanagedType.LPStr)] string jobName, int level, IntPtr docInfo);
    
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
}

public static class PrinterHelper {
    public static bool SendRawData(string printerName, byte[] data) {
        IntPtr hPrinter = IntPtr.Zero;
        try {
            if (!RawPrinterHelper.OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) {
                return false;
            }
            
            string jobName = "ZPL Print Job";
            int level = 1;
            
            if (!RawPrinterHelper.StartDocPrinter(hPrinter, jobName, level, IntPtr.Zero)) {
                return false;
            }
            
            if (!RawPrinterHelper.StartPagePrinter(hPrinter)) {
                return false;
            }
            
            IntPtr pBytes = Marshal.AllocHGlobal(data.Length);
            Marshal.Copy(data, 0, pBytes, data.Length);
            int dwWritten = 0;
            
            bool success = RawPrinterHelper.WritePrinter(hPrinter, pBytes, data.Length, out dwWritten);
            
            Marshal.FreeHGlobal(pBytes);
            RawPrinterHelper.EndPagePrinter(hPrinter);
            RawPrinterHelper.EndDocPrinter(hPrinter);
            
            return success;
        } finally {
            if (hPrinter != IntPtr.Zero) {
                RawPrinterHelper.ClosePrinter(hPrinter);
            }
        }
    }
}
"@

try {
    $result = [PrinterHelper]::SendRawData($printerName, $fileContent)
    if ($result) {
        Write-Host "SUCCESS"
        exit 0
    } else {
        $errorCode = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
        Write-Host "FAILED: OpenPrinter or WritePrinter returned false. Error code: $errorCode"
        Write-Error "Print failed with error code: $errorCode"
        exit 1
    }
} catch {
    Write-Host "EXCEPTION: $($_.Exception.Message)"
    Write-Error $_.Exception.Message
    exit 1
}
      `;
      
        fs.writeFileSync(psScriptFile, psScript, 'utf8');
        console.log(`[ZPL] PowerShell script saved to: ${psScriptFile}`);
        
        const { stdout, stderr } = await execAsync(`powershell -ExecutionPolicy Bypass -File "${psScriptFile}"`, { windowsHide: true, timeout: 20000 });
        
        console.log(`[ZPL] PowerShell stdout: ${stdout || '(empty)'}`);
        if (stderr) console.log(`[ZPL] PowerShell stderr: ${stderr}`);
        
        // Clean up script file
        setTimeout(() => fs.unlink(psScriptFile, () => {}), 1000);
        
        if (stdout && stdout.includes('SUCCESS')) {
          success = true;
          console.log(`[ZPL] ✅ Sent via .NET RawPrinterHelper using printer: "${nameToTry}"`);
          break; // Success, exit loop
        } else {
          const errorMsg = stderr || stdout || 'Failed to send via .NET';
          console.log(`[ZPL] .NET method failed for "${nameToTry}": ${errorMsg}`);
          lastError = new Error(errorMsg);
          // Continue to next printer name variation
        }
      } catch (error) {
        console.log(`[ZPL] .NET RawPrinterHelper failed for "${nameToTry}":`, error.message);
        if (error.stdout) console.log('[ZPL] Error stdout:', error.stdout);
        if (error.stderr) console.log('[ZPL] Error stderr:', error.stderr);
        lastError = error;
        // Continue to next printer name variation
      }
    }
  }
  
  // Method 3: COPY to printer share (UNC path) - fallback only
  if (!success && shareName) {
    try {
      const hostname = os.hostname();
      const uncPaths = [
        `\\\\localhost\\${shareName}`,
        `\\\\${hostname}\\${shareName}`,
        `\\\\127.0.0.1\\${shareName}`,
      ];
      
      for (const uncPath of uncPaths) {
        try {
          console.log(`[ZPL] Attempting COPY to UNC: ${uncPath}`);
          await execAsync(`copy /b "${tmpFile}" "${uncPath}"`, { windowsHide: true, timeout: 10000 });
          success = true;
          console.log(`[ZPL] ✅ Sent via UNC path`);
          break;
        } catch (error) {
          console.log(`[ZPL] UNC path ${uncPath} failed`);
          lastError = error;
        }
      }
    } catch (error) {
      console.log('[ZPL] COPY to UNC failed:', error.message);
      lastError = error;
    }
  }
  
  // Method 4: Use cmd /c copy to printer name (better escaping) - try all variations
  if (!success) {
    for (const nameToTry of printerNameVariations) {
      if (success) break;
      try {
        console.log(`[ZPL] Attempting cmd copy to printer: ${nameToTry}`);
        const { stdout } = await execAsync(`cmd /c copy /b "${tmpFile}" "\\\\localhost\\${nameToTry}"`, { windowsHide: true, timeout: 10000 });
        if (stdout && stdout.includes('file(s) copied') && !stdout.includes('0 file')) {
          success = true;
          console.log(`[ZPL] ✅ Sent via cmd copy using printer: "${nameToTry}"`);
          break;
        } else {
          throw new Error(`Copy returned: ${stdout || 'no output'}`);
        }
      } catch (error) {
        console.log(`[ZPL] cmd copy failed for "${nameToTry}":`, error.message);
        lastError = error;
        // Continue to next variation
      }
    }
  }
  
  // Cleanup
  setTimeout(() => fs.unlink(tmpFile, () => {}), 2000);
  
  if (!success) {
    throw new Error(`Failed to send ZPL to printer. Port: ${printerPort || 'N/A'}, Share: ${shareName || 'N/A'}. Error: ${lastError?.message || 'Unknown'}`);
  }
}

app.post('/print-barcode-labels', async (req, res) => {
  let tmp; // Declare outside try block for cleanup in catch
  try {
    const { printerName, items, paperSize, copies, dpi, humanReadable } = req.body || {};

    if (!printerName || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'printerName and items[] are required'
      });
    }

    const paper = paperSize || '3x2inch';
    const copiesCount = Math.max(1, copies || 1);
    const human = !!humanReadable;  // Show human-readable text below barcode

    function pageSize(p) {
      if (p === '50x30mm') return { w: mm(50), h: mm(30) };
      if (p === '60x40mm') return { w: mm(60), h: mm(40) };
      // User's actual label size: 5.8cm x 4cm = 58mm x 40mm
      return { w: mm(58), h: mm(40) }; // 5.8cm x 4cm (landscape) 
    }

    function shortDate(iso) {
      if (!iso) return '__/__/____';
      const d = new Date(iso);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    }

    // Get dimensions
    const { w: labelWidth, h: labelHeight } = pageSize(paper);
    
    tmp = path.join(os.tmpdir(), `labels_${Date.now()}.pdf`);
    
    // Create landscape PDF matching user's actual label size: 58mm x 40mm
    // This produces horizontal barcode in PDF viewer - exactly like boxhero.io
    const doc = new PDFDocument({
      size: [labelWidth, labelHeight], // LANDSCAPE: 58mm wide × 40mm tall (same as boxhero.io)
      margins: { left: 0, right: 0, top: 0, bottom: 0 },
      autoFirstPage: false
    });
    
    console.log(`[PDF] Page size: ${labelWidth.toFixed(2)}pt × ${labelHeight.toFixed(2)}pt (${(labelWidth/2.83464567).toFixed(1)}mm × ${(labelHeight/2.83464567).toFixed(1)}mm)`);
    
    // Safe margins – most barcode/label printers have ~3-4 mm non-printable area
    const M = { 
      left: mm(3),    
      right: mm(3), 
      top: mm(2),     
      bottom: mm(2)   
    };
    
    // Content area (landscape dimensions)
    const CW = labelWidth - M.left - M.right;   // 58 - 3 - 3 = 52mm
    const CH = labelHeight - M.top - M.bottom;   // 40 - 2 - 2 = 36mm
    
    const stream = fs.createWriteStream(tmp);
    doc.pipe(stream);

    // Compact font sizes – fits within safe area
    const TITLE = paper === '3x2inch' ? 9 : 8;
    const META = paper === '3x2inch' ? 6 : 6;
    
    // Barcode dimensions – use 65% of safe content width to avoid edge clipping
    const BAR_W_MAX = CW * 0.65;
    const BAR_H_MM = paper === '3x2inch' ? 7 : 7;
    const SCALE = 2;

    for (const it of items) {
      for (let c = 0; c < copiesCount; c++) {
        doc.addPage();

        // Start drawing from top-left with margins (EXACT match to backend)
        let y = M.top;
        const leftMargin = M.left;
        const contentWidth = CW;

        // ---- TITLE (Product Name) ----
        doc.font('Helvetica-Bold').fontSize(TITLE);
        let title = (it.name || '').toUpperCase().trim();
        let fontSize = TITLE;
        
        // Auto-shrink title if too wide (EXACT match to backend)
        while (fontSize > 7 && doc.widthOfString(title) > contentWidth * 0.98) {
          fontSize -= 0.3;
          doc.fontSize(fontSize);
        }
        
        const titleWidth = doc.widthOfString(title);
        const titleX = leftMargin + (contentWidth - titleWidth) / 2;
        doc.text(title, titleX, y, { width: contentWidth, align: 'center', lineBreak: false });
        y += doc.heightOfString(title, { width: contentWidth }) + mm(0.2); // Very minimal spacing

        // ---- META ROW (Weight & Price) ----
        doc.font('Helvetica').fontSize(META);
        const leftText = it.netWeight ? `NET WT: ${it.netWeight}` : '';
        const rightText = (it.price !== undefined && it.price !== null) ? `RS ${Math.round(Number(it.price))}` : '';
        
        if (leftText || rightText) {
          const gap = mm(3);
          const leftW = doc.widthOfString(leftText);
          const rightW = doc.widthOfString(rightText);
          const totalW = leftW + (leftText && rightText ? gap : 0) + rightW;
          const startX = leftMargin + (contentWidth - totalW) / 2;
          
          if (leftText) doc.text(leftText, startX, y, { lineBreak: false });
          if (rightText) doc.text(rightText, startX + leftW + (leftText ? gap : 0), y, { lineBreak: false });
          y += doc.heightOfString('Ag') + mm(0.2); // Very minimal spacing
        }

        // ---- DATES ROW (PKG & EXP) ----
        const pkgText = `PKG: ${shortDate(it.packageDateISO)}`;
        const expText = `EXP: ${shortDate(it.expiryDateISO)}`;
        const pkgW = doc.widthOfString(pkgText);
        const expW = doc.widthOfString(expText);
        const datesGap = mm(4);
        const datesTotal = pkgW + datesGap + expW;
        const datesX = leftMargin + (contentWidth - datesTotal) / 2;
        
        doc.text(pkgText, datesX, y, { lineBreak: false });
        doc.text(expText, datesX + pkgW + datesGap, y, { lineBreak: false });
        y += doc.heightOfString('Ag') + mm(0.3); // Minimal spacing before barcode

        // ---- BARCODE ----
        try {
          const png = await new Promise((resolve, reject) => {
            bwipjs.toBuffer({
              bcid: 'code128',
              text: String(it.barcode),
              scale: SCALE,
              height: BAR_H_MM,
              includetext: human,
              textxalign: 'center',
              backgroundcolor: 'FFFFFF'
            }, (err, buf) => {
              if (err) reject(typeof err === 'string' ? new Error(err) : err);
              else resolve(buf);
            });
          });

          // Read PNG dimensions (EXACT match to backend)
          let pngWidth = 1, pngHeight = 1;
          try {
            if (png.length > 24) {
              pngWidth = png.readUInt32BE(16);
              pngHeight = png.readUInt32BE(20);
            }
          } catch {}
          
          const aspectRatio = pngHeight / pngWidth;

          // Calculate barcode size to fit remaining space (EXACT match to backend)
          const remainingHeight = (M.top + CH) - y;
          
          let barcodeWidth = BAR_W_MAX;
          let barcodeHeight = barcodeWidth * aspectRatio;

          // Ensure barcode fits vertically – use 80% of remaining height to prevent clipping
          if (barcodeHeight > remainingHeight * 0.80) {
            barcodeHeight = remainingHeight * 0.80;
            barcodeWidth = barcodeHeight / aspectRatio;
          }

          // Final width guard: never exceed safe content width
          if (barcodeWidth > contentWidth * 0.90) {
            barcodeWidth = contentWidth * 0.90;
            barcodeHeight = barcodeWidth * aspectRatio;
          }

          // Center barcode horizontally and vertically in remaining space
          const barcodeX = leftMargin + (contentWidth - barcodeWidth) / 2;
          let barcodeY = y + (remainingHeight - barcodeHeight) / 2;
          
          // Final safety check: ensure barcode doesn't exceed page bounds
          const maxY = labelHeight - M.bottom - barcodeHeight;
          if (barcodeY > maxY) {
            barcodeY = maxY;
          }

          doc.image(png, barcodeX, barcodeY, {
            width: barcodeWidth,
            height: barcodeHeight
          });
        } catch (err) {
          console.error('Barcode generation error:', err);
        }
      }
    }

    doc.end();
    
    // Wait for PDF to be fully written
    await new Promise((resolve, reject) => {
      stream.once('finish', resolve);
      stream.once('error', reject);
    });

    console.log(`[PDF] Created: ${tmp} (${fs.statSync(tmp).size} bytes)`);
    
    // Send PDF to frontend for browser print (instead of printing from backend)
    // Frontend will open browser print dialog - exactly like boxhero.io
    const filename = `barcode-labels-${Date.now()}.pdf`;
    
    // Set proper headers for PDF response (like boxhero.io)
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`); // inline = open in browser
    res.setHeader('Content-Length', fs.statSync(tmp).size); // Set content length for proper streaming
    
    // Stream the PDF file to response
    const fileStream = fs.createReadStream(tmp);
    
    fileStream.on('error', (err) => {
      console.error(`[STREAM ERROR] Failed to stream PDF:`, err);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Failed to stream PDF file'
        });
      }
      // Cleanup on error
      setTimeout(() => fs.unlink(tmp, () => {}), 1000);
    });
    
    // Pipe PDF to response
    fileStream.pipe(res);
    
    // Cleanup after streaming completes
    fileStream.on('end', () => {
      console.log(`[PDF] Streamed successfully to frontend`);
      setTimeout(() => {
        fs.unlink(tmp, (err) => {
          if (err && err.code !== 'ENOENT') {
            console.error(`[CLEANUP] Failed to delete temp file:`, err);
          }
        });
      }, 2000); // Give frontend time to download
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    
    // Cleanup temp file if it exists
    if (typeof tmp !== 'undefined') {
      setTimeout(() => {
        fs.unlink(tmp, (err) => {
          if (err && err.code !== 'ENOENT') console.error(`[CLEANUP] Failed to delete temp file:`, err);
        });
      }, 1000);
    }
    
    // Only send error response if headers haven't been sent (i.e., streaming hasn't started)
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🖨️  Print Server running on http://localhost:${PORT}`);
  console.log(`📡 Waiting for print requests...`);
}).on('error', (error) => {
  const logDir = path.join(__dirname, 'daemon');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, 'server-startup-error.log');
  const msg = `${new Date().toISOString()} ${error.stack || error.message}\n`;
  fs.appendFileSync(logPath, msg);
  console.error('Failed to start server:', error.message);
  process.exit(1);
});

// Handle errors
process.on('uncaughtException', (error) => {
  const logDir = path.join(__dirname, 'daemon');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  fs.appendFileSync(
    path.join(logDir, 'server-crash.log'),
    `${new Date().toISOString()} ${error.stack || error.message}\n`
  );
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});