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

const ACE_STUDIOS_CONTACT = '+92 336 2500357';

const RECEIPT_EXCHANGE_POLICY_TITLE = 'EXCHANGE POLICY';
const RECEIPT_EXCHANGE_POLICY_LINES = [
  'Exchange within 7 days.',
  'No returns. Exchange only.',
  'Price difference applies.',
];

function shouldPrintReceiptExchangePolicy(receiptData) {
  return !receiptData?.documentTitle?.trim();
}

// Use logo from PrintServer folder only (client laptop deploy)
const localLogo = path.join(__dirname, 'Printserver-logo.png');
const logoPath = fs.existsSync(localLogo) ? path.resolve(localLogo) : null;

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
  // Eltron / UPS LP 2844 — EPL (queue often named "Zebra UPS 2844")
  if (
    /\(epl\)|\bepl\b|eltron|\blp\s*2844\b|lp2844|ups lp|\bups\s*2844\b|\b2844\b/.test(s)
  ) {
    return 'epl';
  }
  if (s.includes('zebra') || s.includes('zdesigner')) return 'zpl';
  if (s.includes('generic') || s.includes('escpos') || s.includes('blackcopper') || s.includes('80mm') || s.includes('58mm')) return 'escpos';
  return 'generic';
}

function deriveLabelProfile(p) {
  const hint = deriveLanguageHint(p);
  if (hint === 'epl' || hint === 'zpl') {
    return {
      paperSize: '50x25mm',
      widthMM: 50,
      heightMM: 25,
      gapMM: 3,
      dpi: 203,
      language: hint,
      model: hint === 'epl' ? 'Eltron LP 2844 (EPL, 50×25 mm)' : 'Zebra (ZPL)',
    };
  }
  return null;
}

function labelDimensionsMM(paperSize) {
  if (paperSize === '50x25mm') return { w: 50, h: 25 };
  if (paperSize === '50x30mm') return { w: 50, h: 30 };
  if (paperSize === '60x40mm') return { w: 60, h: 40 };
  if (paperSize === '58x40mm') return { w: 58, h: 40 };
  if (paperSize === '3x2inch') return { w: 76.2, h: 50.8 };
  if (paperSize === '40x25mm') return { w: 40, h: 25 };
  return { w: 50, h: 25 };
}

function labelGapDots(dpi, gapMm = 3) {
  return Math.max(8, Math.round((gapMm * dpi) / 25.4));
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

// Installed printer queue names from HKLM (works when PowerShell fails or service runs as SYSTEM)
async function getPrintersViaRegistry() {
  const { stdout } = await execFileAsync(
    'reg',
    ['query', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Print\\Printers'],
    { timeout: 8000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }
  );
  const names = new Set();
  stdout.split(/\r?\n/).forEach((line) => {
    const m = line.match(/Printers\\([^\\\r\n]+)/);
    if (m?.[1]) names.add(m[1].trim());
  });
  const def = await getDefaultPrinterFromRegistryHKCU().catch(() => null);
  return Array.from(names)
    .filter((name) => name && !isVirtualPrinter(name))
    .map((name) => ({
      name,
      id: `${name.toLowerCase().replace(/\s+/g, '-')}@${process.env.COMPUTERNAME || 'local'}`,
      isDefault: def ? name === def : false,
      status: 'available',
    }));
}

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
    const cimPrinters = await getPrintersViaCIM().catch((err) => {
      console.warn('[printers] CIM failed:', err?.message || err);
      return [];
    });
    if (cimPrinters.length) {
      printers = normalizeAndSort(cimPrinters);
    } else {
      // Fallback to Get-Printer
      const [gpPrintersRaw, defName] = await Promise.all([
        getPrintersViaGetPrinter().catch((err) => {
          console.warn('[printers] Get-Printer failed:', err?.message || err);
          return [];
        }),
        getDefaultPrinterFromRegistryHKCU().catch(() => null),
      ]);
      const gpPrinters = gpPrintersRaw.map((p) => ({
        ...p,
        id: `${String(p.name).toLowerCase().replace(/\s+/g, '-')}@windows`,
      }));
      if (gpPrinters.length) {
        printers = normalizeAndSort(gpPrinters, defName);
      } else {
        const regPrinters = await getPrintersViaRegistry().catch((err) => {
          console.warn('[printers] Registry enumerate failed:', err?.message || err);
          return [];
        });
        if (regPrinters.length) {
          console.log(`[printers] Using registry list (${regPrinters.length} queues)`);
          printers = normalizeAndSort(regPrinters, defName);
        }
      }
    }

    // Add derived fields
    printers = printers.map(p => ({
      ...p,
      languageHint: deriveLanguageHint(p),
      receiptProfile: deriveReceiptProfile(p),
      labelProfile: deriveLabelProfile(p),
    }));

    // Drop virtual printers (Print to PDF, XPS, Fax, OneNote) — see
    // isVirtualPrinter for why these can never be a valid receipt printer.
    printers = printers.filter(p => !isVirtualPrinter(p.name));

    // Fallback to default if no printers found
    if (printers.length === 0) {
      console.warn(
        '[printers] No queues found — restart Print Server as your Windows user (not only as a service), or run SETUP-CLIENT-LAPTOP.bat as Admin.'
      );
      return [{
        name: 'Default Printer',
        id: 'default@local',
        isDefault: true,
        status: 'available',
        languageHint: 'escpos',
        receiptProfile: { roll: '80mm', printableWidthMM: 72, columns: { fontA: 48, fontB: 64 } },
        detectionWarning:
          'Could not enumerate Windows printers. Restart the print server on the PC where printers are installed.',
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

    /** Word-wrap within printable width (for long store addresses). */
    function drawWrapped(text, x, y, width, opts) {
      const font = opts.font || baseFont;
      const size = opts.maxSize ?? BODY_MAX;
      const align = opts.align || 'center';
      const content = String(text || '').trim();
      if (!content) return { size, height: 0 };
      doc.font(font).fontSize(size);
      const blockH = doc.heightOfString(content, { width, align });
      doc.text(content, x, y, { width, align });
      return { size, height: blockH };
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
        return 'Shop No: 18C, Tariq Rd, opposite Tariq Center, P.E.C.H.S Block 2 Block 2 P.E.C.H.S., Karachi, 70400';
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
    const addrTop = drawWrapped(branchAddress, margins.left, y, W, {
      maxSize: 11,
      align: 'center',
      font: boldFont
    });
    y += addrTop.height + 2;

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

    // Cashier | Salesperson | Customer | Phone
    const rawCashier =
      typeof receiptData.cashier === 'string' ? receiptData.cashier.trim() : '';
    const salesperson =
      typeof receiptData.salesperson === 'string' ? receiptData.salesperson.trim() : '';
    const customerType = receiptData.customerType || 'Walk-in';
    const customerPhone =
      typeof receiptData.customerPhone === 'string' ? receiptData.customerPhone.trim() : '';
    // Only show Cashier when a real employee name is provided. "Walk-in" is a
    // customer type, not a cashier, so showing it here is meaningless.
    if (rawCashier && rawCashier.toLowerCase() !== 'walk-in') {
      y += rowLR('Cashier', rawCashier, y);
    }
    if (salesperson) {
      y += rowLR('Salesperson', salesperson, y);
    }
    y += rowLR('Customer', customerType, y);
    if (customerPhone) {
      y += rowLR('Phone', customerPhone, y) + 2;
    } else {
      y += 2;
    }

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

    if (shouldPrintReceiptExchangePolicy(receiptData)) {
      y += hr(y, 'dotted') + 2;
      const usedPolicyTitle = drawFit(RECEIPT_EXCHANGE_POLICY_TITLE, margins.left, y, W, {
        maxSize: 7.6,
        minSize: 7.0,
        align: 'center',
        font: boldFont
      });
      y += lineH(usedPolicyTitle) - 1;
      for (const line of RECEIPT_EXCHANGE_POLICY_LINES) {
        const block = drawWrapped(line, margins.left, y, W, {
          maxSize: 7.0,
          align: 'center',
          font: baseFont
        });
        y += block.height + 1;
      }
    }

    const footerAddress = normalizeReceiptAddress(receiptData.address);
    const footerLines = [
      'Call / WhatsApp: 03013181111',
      'Website: pehnawastore.pk'
    ];
    for (const line of footerLines) {
      const usedF = drawFit(line, margins.left, y, W, {
        maxSize: 9.8,
        minSize: 8.0,
        align: 'center'
      });
      y += lineH(usedF) - 1;
    }
    const footerAddr = drawWrapped(footerAddress, margins.left, y, W, {
      maxSize: 9.8,
      align: 'center',
      font: baseFont
    });
    y += footerAddr.height + 1;

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
      'Website: acestudiosus.com',
      `Contact: ${ACE_STUDIOS_CONTACT}`
    ];
    for (const line of aceLines) {
      const aceBlock = drawWrapped(line, margins.left, y, W, {
        maxSize: 8.0,
        align: 'center',
        font: baseFont
      });
      y += aceBlock.height + 1;
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
const BARCODE_LABEL_BRAND_PREFIX = 'PEHNAWA';

function formatBarcodeLabelTitle(productName) {
  const name = String(productName || '').trim();
  if (!name) return BARCODE_LABEL_BRAND_PREFIX;
  const upper = name.toUpperCase();
  if (upper.startsWith(`${BARCODE_LABEL_BRAND_PREFIX} `)) return upper;
  if (upper.startsWith('PEHNAVA ')) return `${BARCODE_LABEL_BRAND_PREFIX} ${upper.slice(8)}`;
  return `${BARCODE_LABEL_BRAND_PREFIX} ${upper}`;
}

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

function formatDateEplShort(iso) {
  if (!iso) return '--/--/--';
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

function formatLabelPrice(price) {
  const n = Number(price);
  if (!Number.isFinite(n)) return '';
  return `PRICE ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** EPL is 7-bit; strip smart punctuation so nothing prints as garbage on LP 2844. */
function toEplAscii(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/"/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeEPL(text) {
  return toEplAscii(text);
}

function splitPehnawaLabelTitle(productName) {
  const full = formatBarcodeLabelTitle(productName || '');
  const upper = toEplAscii(full).toUpperCase();
  const brand = BARCODE_LABEL_BRAND_PREFIX.toUpperCase();
  if (upper.startsWith(`${brand} `)) {
    return { brand, product: upper.slice(brand.length + 1).trim() };
  }
  return { brand, product: upper.replace(/^PEHNAVA\s+/i, '').trim() || upper };
}

/** EPL built-in font approximate cell heights at 203 DPI (v-mul 1). */
function eplFontCellHeight(font, vMul = 1) {
  const h = { 1: 14, 2: 18, 3: 22, 4: 26, 5: 30 }[font] || 14;
  return h * vMul;
}

function eplCharWidthDots(font, hMul = 1) {
  // Slightly pessimistic — Eltron fonts print wider than nominal on LP 2844
  const w = { 1: 8, 2: 10, 3: 12, 4: 14, 5: 16 }[font] || 8;
  return Math.ceil(w * hMul * 1.12);
}

function eplCenteredX(text, font, hMul, widthDots, marginH) {
  const inner = widthDots - 2 * marginH;
  const tw = text.length * eplCharWidthDots(font, hMul);
  return marginH + Math.max(0, Math.floor((inner - tw) / 2));
}

function eplMaxCharsPerLine(widthDots, marginH, font, hMul) {
  const inner = widthDots - 2 * marginH;
  const cw = eplCharWidthDots(font, hMul);
  return Math.max(8, Math.floor(inner / cw) - 1);
}

function wrapEplText(text, maxChars, maxLines) {
  const words = toEplAscii(text).toUpperCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word.length > maxChars ? `${word.slice(0, maxChars - 3)}...` : word;
    if (lines.length >= maxLines - 1) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length > maxLines) lines.length = maxLines;
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    if (last.length > maxChars) lines[maxLines - 1] = `${last.slice(0, maxChars - 3)}...`;
  }
  return lines;
}

/** Code 128 module count (approx) for centering on label. */
function estimateEplCode128WidthDots(dataLen, narrow) {
  const modules = 11 * dataLen + 35;
  return modules * narrow;
}

/** Pick module width so every label barcode fills ~the same printable width. */
function chooseEplBarNarrow(dataLen, printableW, fillRatio = 0.84) {
  const targetW = printableW * fillRatio;
  for (let narrow = 3; narrow >= 1; narrow -= 1) {
    if (estimateEplCode128WidthDots(dataLen, narrow) <= targetW) {
      return narrow;
    }
  }
  return 1;
}

function eplRowAdvance(row, gap) {
  return eplFontCellHeight(row.font, row.vMul || 1) + gap;
}

/** Compact 50 mm × 25 mm — one sticker, top-down (LP 2844 / GC420t EPL). */
function generateEPLFor50x25Label(item, options, widthDots, heightDots, gapDots, humanReadable) {
  const marginH = 22;
  const marginTop = 8;
  const marginBottom = 10;
  const gapBetweenLines = 2;
  const gapBeforeBarcode = 4;
  const gapAfterBars = 4;
  const fontBrand = 2;
  const fontName = 1;
  const fontPrice = 2;
  const fontHri = 1;
  const bcData = item.barcode ? escapeEPL(String(item.barcode)) : '';
  const printableW = widthDots - 2 * marginH;
  const barNarrow = bcData
    ? chooseEplBarNarrow(bcData.length, printableW)
    : 2;
  const barWide = 4;

  const { brand, product } = splitPehnawaLabelTitle(item.name || '');
  const nameMaxChars = Math.min(20, eplMaxCharsPerLine(widthDots, marginH, fontName, 1));
  const productLines = wrapEplText(product, nameMaxChars, 2);

  const textRows = [];
  textRows.push({ font: fontBrand, hMul: 1, vMul: 1, text: brand });
  for (const line of productLines) {
    textRows.push({ font: fontName, hMul: 1, vMul: 1, text: line });
  }
  if (item.price !== undefined && item.price !== null) {
    const n = Math.round(Number(item.price));
    textRows.push({
      font: fontPrice,
      hMul: 1,
      vMul: 1,
      text: `RS ${n.toLocaleString('en-US')}`,
    });
  }

  function measureLayout(rows) {
    let endY = marginTop;
    for (const row of rows) endY += eplRowAdvance(row, gapBetweenLines);
    if (rows.length) endY -= gapBetweenLines;
    const hriH = humanReadable ? eplFontCellHeight(fontHri, 1) + gapAfterBars : 0;
    const barsY = endY + gapBeforeBarcode;
    let barsH = heightDots - marginBottom - hriH - barsY;
    barsH = Math.max(34, Math.min(52, barsH));
    const overflow = barsY + barsH + hriH + marginBottom > heightDots;
    return { endY, barsY, barsH, overflow };
  }

  let layout = measureLayout(textRows);
  if (layout.overflow && productLines.length > 1) {
    const compact = [];
    compact.push({ font: fontBrand, hMul: 1, vMul: 1, text: brand });
    const one = wrapEplText(product, nameMaxChars, 1)[0] || '';
    if (one) compact.push({ font: fontName, hMul: 1, vMul: 1, text: one });
    if (item.price !== undefined && item.price !== null) {
      const n = Math.round(Number(item.price));
      compact.push({ font: fontPrice, hMul: 1, vMul: 1, text: `RS ${n.toLocaleString('en-US')}` });
    }
    textRows.length = 0;
    textRows.push(...compact);
    layout = measureLayout(textRows);
  }

  const finalBcY = layout.barsY;
  const bcHeight = layout.barsH;
  const textEndY = layout.endY;

  let epl = 'N\n';
  epl += `q${widthDots}\n`;
  epl += `Q${heightDots},${gapDots}\n`;
  epl += 'S6\n';
  epl += 'D8\n';
  epl += 'ZT\n';

  let y = marginTop;
  for (const row of textRows) {
    const x = eplCenteredX(row.text, row.font, row.hMul, widthDots, marginH);
    epl += `A${x},${y},0,${row.font},${row.hMul},${row.vMul},N,"${escapeEPL(row.text)}"\n`;
    y += eplRowAdvance(row, gapBetweenLines);
  }

  if (bcData) {
    const estW = estimateEplCode128WidthDots(bcData.length, barNarrow);
    const bcX = marginH + Math.max(0, Math.floor((widthDots - 2 * marginH - estW) / 2));
    epl += `B${bcX},${finalBcY},0,1,${barNarrow},${barWide},${bcHeight},N,"${bcData}"\n`;
    if (humanReadable) {
      const hriY = finalBcY + bcHeight + gapAfterBars;
      const hriX = eplCenteredX(bcData, fontHri, 1, widthDots, marginH);
      epl += `A${hriX},${hriY},0,${fontHri},1,1,N,"${bcData}"\n`;
    }
  }

  epl += 'P1\n';
  return epl;
}

// Eltron LP 2844 — EPL2, 203 DPI (paperSize must match physical roll)
function generateEPLForLabel(item, options) {
  const dpi = options.dpi || 203;
  const humanReadable = options.humanReadable !== false;
  const gapMm = options.labelGapMM ?? options.gapMm ?? 3;
  const { w, h } = labelDimensionsMM(options.paperSize || '50x25mm');
  const widthDots = Math.round((w * dpi) / 25.4);
  const heightDots = Math.round((h * dpi) / 25.4);
  const gapDots = labelGapDots(dpi, gapMm);
  const is5025 = w <= 51 && h <= 26;

  if (is5025) {
    return generateEPLFor50x25Label(
      item,
      options,
      widthDots,
      heightDots,
      gapDots,
      humanReadable,
    );
  }

  const marginH = 32;
  const marginV = 14;
  const gapBetweenLines = 6;
  const gapBeforeBarcode = 10;
  const fontName = 3;
  const fontPrice = 4;
  const fontDates = 2;
  const hrReserve = humanReadable ? 22 : 0;
  const bcData = item.barcode ? escapeEPL(String(item.barcode)) : '';
  const printableW5025 = widthDots - 2 * marginH;
  const barNarrow = bcData
    ? chooseEplBarNarrow(bcData.length, printableW5025)
    : 2;
  const barWide = 6;
  const minBarcodeHeight = 64;
  const maxBarcodeHeight = 96;

  const textRows = [];
  const maxNameChars = eplMaxCharsPerLine(widthDots, marginH, fontName, 1);
  for (const line of wrapEplText(formatBarcodeLabelTitle(item.name || ''), maxNameChars, 3)) {
    textRows.push({ font: fontName, hMul: 1, vMul: 1, text: line });
  }
  if (item.netWeight) {
    textRows.push({ font: fontDates, hMul: 1, vMul: 1, text: `NET WT: ${escapeEPL(item.netWeight)}` });
  }
  if (item.price !== undefined && item.price !== null) {
    textRows.push({
      font: fontPrice,
      hMul: 1,
      vMul: 2,
      text: formatLabelPrice(item.price),
    });
  }

  let textBlockHeight = 0;
  for (const row of textRows) {
    textBlockHeight += eplFontCellHeight(row.font, row.vMul) + gapBetweenLines;
  }
  if (textRows.length) textBlockHeight -= gapBetweenLines;

  let bcHeight = Math.min(
    maxBarcodeHeight,
    Math.max(minBarcodeHeight, Math.floor(heightDots * 0.32)),
  );

  const blockHeight = textBlockHeight + gapBeforeBarcode + bcHeight + hrReserve;
  let y = Math.max(marginV, Math.floor((heightDots - blockHeight) / 2));

  let epl = 'N\n';
  epl += `q${widthDots}\n`;
  epl += `Q${heightDots},${gapDots}\n`;
  epl += 'S8\n';
  epl += 'D10\n';
  epl += 'ZT\n';

  for (const row of textRows) {
    const x = eplCenteredX(row.text, row.font, row.hMul, widthDots, marginH);
    epl += `A${x},${y},0,${row.font},${row.hMul},${row.vMul},N,"${escapeEPL(row.text)}"\n`;
    y += eplFontCellHeight(row.font, row.vMul) + gapBetweenLines;
  }

  y += gapBeforeBarcode - gapBetweenLines;

  if (bcData) {
    const estW = estimateEplCode128WidthDots(bcData.length, barNarrow);
    const bcX = marginH + Math.max(0, Math.floor((widthDots - 2 * marginH - estW) / 2));
    epl += `B${bcX},${y},0,1,${barNarrow},${barWide},${bcHeight},N,"${bcData}"\n`;
    if (humanReadable) {
      const hriY = y + bcHeight + 8;
      const hriX = eplCenteredX(bcData, 2, 1, widthDots, marginH);
      epl += `A${hriX},${hriY},0,2,1,2,N,"${bcData}"\n`;
    }
  }

  epl += 'P1\n';
  return epl;
}

// Generate ZPL for 58mm x 40mm labels (landscape, horizontal barcode)
function generateZPLForLabel(item, options) {
  const dpi = options.dpi || 203;
  const humanReadable = options.humanReadable;
  const { w, h } = labelDimensionsMM(options.paperSize || '50x25mm');
  const width = Math.round((w * dpi) / 25.4);
  const height = Math.round((h * dpi) / 25.4);
  
  // Generous margins to prevent cutting on all printers
  const marginX = dpi === 300 ? 50 : 40;  // Left/Right margin (~4mm)
  const marginY = dpi === 300 ? 30 : 24;  // Top/Bottom margin (~3mm)
  const contentWidth = width - (marginX * 2);
  const startX = marginX;
  
  // Font sizes for horizontal layout
  const fontSizeLarge = dpi === 300 ? 22 : 20;
  const fontSizeMedium = dpi === 300 ? 18 : 16;
  
  // Y positions - horizontal layout
  let yPos = marginY;
  const lineHeight = dpi === 300 ? 18 : 15;
  const lineSpacing = dpi === 300 ? 2 : 1;
  
  // Product name
  const productName = escapeZPL(formatBarcodeLabelTitle(item.name || ''));
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
  const priceText =
    item.price !== undefined && item.price !== null ? formatLabelPrice(item.price) : '';

  if (netWeightText || priceText) {
    zpl += `^CF0,${fontSizeMedium}\n`;
    if (netWeightText) {
      zpl += `^FO${textStartX},${currentY}^FD${escapeZPL(netWeightText)}^FS\n`;
      currentY += lineHeight + lineSpacing;
    }
    if (priceText) {
      zpl += `^FO${textStartX},${currentY}^FB${textWidth},1,0,C,0^FD${escapeZPL(priceText)}^FS\n`;
      currentY += lineHeight + lineSpacing;
    }
  }

  currentY += lineSpacing;
  
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

const { sendRawLabelToPrinter } = require('./lib/raw-print-windows');

// EPL/ZPL → Windows spooler (rawprint.exe / koffi — no PowerShell; works as Windows service)
async function sendRawToPrinter(printerName, rawContent, logTag = 'RAW') {
  console.log(`[${logTag}] ${rawContent.length} chars for "${printerName}"`);
  console.log(`[${logTag}] Head:\n${rawContent.substring(0, 400)}`);
  try {
    await sendRawLabelToPrinter(printerName, rawContent, logTag);
  } catch (err) {
    throw new Error(`Failed to send raw label data to printer "${printerName}". ${err.message}`);
  }
}

app.post('/print-barcode-labels', async (req, res) => {
  let tmp; // Declare outside try block for cleanup in catch
  try {
    const {
      printerName,
      items,
      paperSize,
      copies,
      dpi: dpiBody,
      humanReadable,
      printMode,
      languageHint: languageHintBody,
      labelGapMM: labelGapMMBody,
    } = req.body || {};

    if (!printerName || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'printerName and items[] are required'
      });
    }

    const languageHint =
      languageHintBody || deriveLanguageHint({ name: printerName });
    const mode = printMode || 'auto';
    const useRaw =
      mode === 'raw' ||
      (mode === 'auto' && (languageHint === 'epl' || languageHint === 'zpl'));

    const paper = paperSize || (languageHint === 'epl' ? '50x25mm' : '3x2inch');
    const copiesCount = Math.max(1, copies || 1);
    const human = !!humanReadable;
    const dpi = dpiBody || 203;
    const labelGapMM = labelGapMMBody ?? 3;

    if (useRaw) {
      let raw = '';
      for (const it of items) {
        for (let c = 0; c < copiesCount; c++) {
          if (languageHint === 'epl') {
            raw += generateEPLForLabel(it, {
              dpi,
              paperSize: paper,
              humanReadable: human,
              labelGapMM,
            });
          } else {
            raw += generateZPLForLabel(it, { dpi, humanReadable: human, paperSize: paper });
          }
        }
      }
      const tag = languageHint === 'epl' ? 'EPL' : 'ZPL';
      await sendRawToPrinter(printerName, raw, tag);
      const total = items.length * copiesCount;
      return res.json({
        success: true,
        mode: 'raw',
        languageHint,
        message: `Sent ${total} label(s) to ${printerName} via ${tag}`,
      });
    }

    function pageSize(p) {
      const dim = labelDimensionsMM(p || '50x25mm');
      return { w: mm(dim.w), h: mm(dim.h) };
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
    const TITLE = paper === '3x2inch' ? 11 : 10;
    const META = paper === '3x2inch' ? 9 : 8;
    const PRICE = paper === '3x2inch' ? 10 : 9;
    
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
        let title = formatBarcodeLabelTitle(it.name || '');
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
        if (leftText) {
          doc.font('Helvetica').fontSize(META);
          doc.text(leftText, leftMargin, y, { width: contentWidth, align: 'center', lineBreak: false });
          y += doc.heightOfString('Ag') + mm(0.2);
        }
        if (it.price !== undefined && it.price !== null) {
          doc.font('Helvetica-Bold').fontSize(PRICE);
          const priceLine = formatLabelPrice(it.price);
          doc.text(priceLine, leftMargin, y, { width: contentWidth, align: 'center', lineBreak: false });
          y += doc.heightOfString('Ag') + mm(0.35);
        }

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