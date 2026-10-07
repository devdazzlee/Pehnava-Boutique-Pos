// src/services/print-receipt-pdf.service.ts
import fs from 'fs';
import os from 'os';
import path from 'path';
import PDFDocument from 'pdfkit';
import { print } from 'pdf-to-printer';
import * as bwipjs from 'bwip-js';

const ACE_STUDIOS_CONTACT = '+92 336 2500357';

type PrintJobInput = {
  printer: { name: string; columns?: { fontA: number; fontB: number } };
  job?: { copies?: number };
  receiptData: {
    transactionId: string;
    timestamp?: string;
    storeName?: string;
    address?: string;
    tagline?: string;
    strn?: string;
    cashier?: string;
    customerType?: string;
    items: Array<{
      name: string;
      quantity: number;
      price: number;
      unit?: string;
      lineTotal?: number;
    }>;
    subtotal: number;
    discount?: number;
    taxPercent?: number;
    total?: number;
    amountPaid?: number;
    changeAmount?: number;
    promo?: string;
    thankYouMessage?: string;
    footerMessage?: string;
  };
  logoPath?: string;
};

function mm(n: number) { return n * 2.83464567; }
const money = (n: number) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function printReceiptPDF(input: PrintJobInput) {
  const { printer, job, receiptData, logoPath } = input;
  const copies = job?.copies ?? 1;

  // Paper geometry (80mm roll)
  const pageWidth = mm(80);
  const margins = { left: mm(2.5), right: mm(2.5), top: mm(4), bottom: mm(5) };
  const W = pageWidth - margins.left - margins.right;

  // PDF init
  const tmp = path.join(os.tmpdir(), `receipt_${Date.now()}.pdf`);
  const doc = new PDFDocument({
    size: [pageWidth, mm(1400)],
    margins,
    autoFirstPage: true,
    pdfVersion: '1.4'
  });
  const stream = fs.createWriteStream(tmp);
  doc.pipe(stream);

  // Fonts: use Helvetica-Bold (narrower than Courier) → more room, still dark
  const baseFont = 'Helvetica-Bold';
  const boldFont = 'Helvetica-Bold';
  doc.fillColor('#000').strokeColor('#000').opacity(1);

  // Global sizes (upper/lower bounds)
  const BODY_MAX = 10.5;
  const BODY_MIN = 7.6;
  const TOTAL_MAX = 12.0;
  const TOTAL_MIN = 7.5;  // Lowered to allow more shrinking for headers if needed
  const HEAD_MAX = 16;

  doc.font(baseFont).fontSize(BODY_MAX);

  // Util: single-line height for current font size
  const lineH = (size: number) => {
    doc.fontSize(size);
    return Math.ceil(doc.heightOfString('Ag')) + 2;
  };

  // Fit a text into a width by shrinking font down to min
  function drawFit(text: string, x: number, y: number, width: number, opts: {
    maxSize: number, minSize: number, align?: 'left' | 'center' | 'right', font?: string
  }): number {
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
    
    // Always draw without width constraint to prevent clipping - calculate position manually
    doc.font(font).fontSize(size);
    textWidth = doc.widthOfString(text, { characterSpacing: 0 });
    
    let drawX = x;
    if (opts.align === 'right') {
      drawX = x + width - textWidth;
    } else if (opts.align === 'center') {
      drawX = x + (width - textWidth) / 2;
    }
    
    // Draw without width constraint to show full text
    doc.text(text, drawX, y);
    return size;
  }

  function drawWrapped(
    text: string,
    x: number,
    y: number,
    width: number,
    opts: { maxSize: number; align?: 'left' | 'center' | 'right'; font?: string },
  ): { size: number; height: number } {
    const font = opts.font || baseFont;
    const size = opts.maxSize;
    const align = opts.align || 'center';
    const content = String(text || '').trim();
    if (!content) return { size, height: 0 };
    doc.font(font).fontSize(size);
    const blockH = doc.heightOfString(content, { width, align });
    doc.text(content, x, y, { width, align });
    return { size, height: blockH };
  }

  // Draw a two-column row (left label, right value) fully on one line each
  function rowLR(label: string, value: string, y: number, opts?: { bold?: boolean, maxSize?: number, minSize?: number }): number {
    const LBL_W = W * 0.40;
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
    doc.text(label, margins.left, y);

    // Right value - NO WIDTH CONSTRAINT, draw from right edge at full size
    doc.font(font);
    doc.fontSize(maxSize);
    const valueWidth = doc.widthOfString(value);
    // Only shrink if absolutely necessary (text would overflow page)
    let sizeR = maxSize;
    doc.fontSize(sizeR);
    let checkWidth = doc.widthOfString(value);
    if (checkWidth > W * 0.7) {
      // Only shrink if text would take more than 70% of page width
      while (sizeR > 7 && checkWidth > W * 0.7) {
        sizeR -= 0.2;
        doc.fontSize(sizeR);
        checkWidth = doc.widthOfString(value);
      }
    }
    doc.fontSize(sizeR);
    const finalValueWidth = doc.widthOfString(value);
    doc.text(value, margins.left + W - finalValueWidth, y);

    const used = Math.min(sizeL, sizeR);
    return lineH(used);
  }

  // Three-column row (ITEM | QTY | RATE) — always single line, no truncation, by:
  // 1) compute natural widths of QTY and RATE at max size, shrink those if needed
  // 2) give remaining width to ITEM and shrink it if needed
  // Three-column row (ITEM | QTY | RATE) — always single line, no truncation
   // Three-column row (ITEM | QTY | RATE) — always single line, no truncation
   function rowIQR(item: string, qty: string, rate: string, y: number, opts?: { header?: boolean }): number {
    const maxSize = opts?.header ? TOTAL_MAX : BODY_MAX;
    const minSize = opts?.header ? TOTAL_MIN : BODY_MIN;
    const font = opts?.header ? boldFont : baseFont;

    // For headers: use generous spacing; for items: compress more
    const itemW = opts?.header ? W * 0.30 : W * 0.35;
    const qtyW = opts?.header ? W * 0.15 : W * 0.15;
    const rateW = opts?.header ? W * 0.55 : W * 0.50;

    const X_ITEM = margins.left;
    const X_QTY  = X_ITEM + itemW;
    const X_RATE = X_QTY  + qtyW;

    doc.font(font);

    // ITEM - left aligned, fit to width
    const sizeItem = drawFit(item, X_ITEM, y, itemW, { maxSize, minSize, align: 'left', font });
    
    // QTY - center aligned, fit to width
    const sizeQty = drawFit(qty, X_QTY, y, qtyW, { maxSize, minSize, align: 'center', font });
    
    // RATE - right aligned, fit to width
    const sizeRate = drawFit(rate, X_RATE, y, rateW, { maxSize, minSize, align: 'right', font });

    const used = Math.min(sizeItem, sizeQty, sizeRate);
    return lineH(used);
  }

  function hr(y: number, style: 'dotted' | 'solid' = 'dotted', thick = 1): number {
    const yy = y + 1;
    if (style === 'dotted') doc.dash(1, { space: 2 }); else doc.undash();
    doc.moveTo(margins.left, yy).lineTo(margins.left + W, yy).lineWidth(thick).stroke();
    doc.undash();
    return  yy + 3 - y; // delta height added
  }

  // ===== HEADER =====
  let y = margins.top;

  // Logo with guaranteed gap - center on full page width
  if (logoPath && fs.existsSync(logoPath)) {
    const maxW = Math.min(mm(64), W);
    const maxH = mm(16);
    // Center on full page width, not just content width
    const x = (pageWidth - maxW) / 2;
    doc.image(logoPath, x, y, { fit: [maxW, maxH] });
    y += maxH + mm(2.0); // safe gap below logo
  }

  // Store name (center) — shrink to fit once (no wrap)
  doc.font(boldFont);
  const usedHead = drawFit(
    (receiptData.storeName || 'Pehnawa Boutique').toUpperCase(),
    margins.left, y, W, { maxSize: HEAD_MAX, minSize: 11.0, align: 'center', font: boldFont }
  );
  y += lineH(usedHead) * 0.9;

  // Tagline / Address / STRN
  doc.font(baseFont);
  const tg = receiptData.tagline || 'Elegance, crafted for every moment.';
  const usedTg = drawFit(tg, margins.left, y, W, { maxSize: BODY_MAX, minSize: BODY_MIN, align: 'center' });
  y += lineH(usedTg) - 2;

  const addr = receiptData.address || 'Shop No: 18C, Tariq Rd, opposite Tariq Center, P.E.C.H.S Block 2 Block 2 P.E.C.H.S., Karachi, 70400';
  const addrBlock = drawWrapped(addr, margins.left, y, W, { maxSize: BODY_MAX, align: 'center' });
  y += addrBlock.height + 2;

  if (receiptData.strn) {
    const usedStrn = drawFit(receiptData.strn, margins.left, y, W, { maxSize: BODY_MAX, minSize: BODY_MIN, align: 'center' });
    y += lineH(usedStrn) - 2;
  }

  y += hr(y, 'dotted');

  // ===== META =====
  const when = new Date(receiptData.timestamp || Date.now());
  const lh1 = rowLR('Receipt #', String(receiptData.transactionId), y);
  y += lh1;

  const lh2 = rowLR('Date', `${when.toLocaleDateString()} ${when.toLocaleTimeString()}`, y);
  y += lh2;

  // Cashier (left) | Customer (right) on same line + extra spacer
  const cashierName = receiptData.cashier || 'Walk-in';
  const customerType = receiptData.customerType || 'Walk-in';
  const lh3 = rowLR(`Cashier  ${cashierName}`, customerType, y);
  y += lh3 + 2;

  y += hr(y, 'dotted');

  // ===== ITEMS HEADER =====
  const lhHdr = rowIQR('ITEM', 'QTY', 'RATE', y, { header: true });
  y += lhHdr;
  y += hr(y, 'solid', 1);

  // ===== ITEMS =====
  for (const it of receiptData.items || []) {
    const name = String(it.name || '');
    const qty  = (it.quantity ?? 0).toString() + (it.unit ? ` ${it.unit}` : '');
    const rate = `${money(
      it.lineTotal != null
        ? Math.abs(Number(it.lineTotal))
        : Number(it.price || 0) * Number(it.quantity || 0),
    )}`;
    const lh = rowIQR(name, qty, rate, y);
    y += lh;
  }

  y += hr(y, 'dotted');

  // ===== TOTALS =====
  const subtotal = Number(receiptData.subtotal || 0);
  const discount = Number(receiptData.discount || 0);
  const tax = receiptData.taxPercent ? (subtotal - discount) * (receiptData.taxPercent / 100) : 0;
  const total = receiptData.total ?? Math.max(0, subtotal - discount + tax);

  y += rowLR('Subtotal', `RS ${money(subtotal)}`, y);
  // Only show discount if it's provided from frontend and greater than 0
  if (receiptData.discount != null && receiptData.discount !== undefined && Number(receiptData.discount) > 0) {
    y += rowLR('Discount', `- RS ${money(discount)}`, y);
  }
  if (tax > 0) y += rowLR(`Tax (${receiptData.taxPercent!.toFixed(0)}%)`, `RS ${money(tax)}`, y);

  y += rowLR('Grand Total', `RS ${money(total)}`, y, { bold: true, maxSize: TOTAL_MAX, minSize: TOTAL_MIN });
  y += hr(y, 'dotted');

  // ===== PAYMENT =====
  const paymentMethod = String((receiptData as any).paymentMethod || 'CASH').toUpperCase();
  y += rowLR('Payment', paymentMethod, y);
  if (receiptData.amountPaid != null) y += rowLR('Paid', `RS ${money(receiptData.amountPaid)}`, y);
  if (receiptData.changeAmount && receiptData.changeAmount > 0) y += rowLR('Change', `RS ${money(receiptData.changeAmount)}`, y);
  y += hr(y, 'dotted');

  // Optional promo
  if (receiptData.promo) {
    const used = drawFit(`Promo: ${receiptData.promo}`, margins.left, y, W, { maxSize: BODY_MAX, minSize: BODY_MIN, align: 'center' });
    y += lineH(used);
  }

  // ===== BARCODE =====
  if (receiptData.transactionId) {
    const png: Buffer = await new Promise((resolve, reject) => {
      bwipjs.toBuffer(
        {
          bcid: 'code128',
          text: String(receiptData.transactionId),
          scale: 2,
          height: 10,
          includetext: false,
          backgroundcolor: 'FFFFFF',
          paddingwidth: 0,
          paddingheight: 0,
        },
        (err: string | Error | undefined, buf: Buffer) => (err ? reject(typeof err === 'string' ? new Error(err) : err) : resolve(buf))
      );
    });
    const barW = mm(48);
    const barH = mm(14);
    const x = margins.left + (W - barW) / 2;
    doc.image(png, x, y + 2, { width: barW, height: barH });
    y += barH + 6;
    const used = drawFit(receiptData.transactionId, margins.left, y, W, { maxSize: 9.8, minSize: 8.0, align: 'center' });
    y += lineH(used);
  }

  // ===== FOOTER =====
  const usedTy = drawFit(receiptData.thankYouMessage || 'Thank you for shopping!', margins.left, y, W, { maxSize: 10.6, minSize: 8.6, align: 'center', font: boldFont });
  y += lineH(usedTy) - 2;
  const footerLines = [
    'Call / WhatsApp: 03013181111',
    'Website: pehnawastore.pk',
  ];
  if (receiptData.footerMessage) footerLines.unshift(receiptData.footerMessage);
  for (const line of footerLines) {
    const usedF = drawFit(line, margins.left, y, W, { maxSize: 9.8, minSize: 8.0, align: 'center' });
    y += lineH(usedF) - 1;
  }
  const footerAddr = drawWrapped(addr, margins.left, y, W, { maxSize: 9.8, align: 'center' });
  y += footerAddr.height + 1;
  y += lineH(8) - 1;
  const usedAce1 = drawFit('Powered by Ace Studios', margins.left, y, W, { maxSize: 8.5, minSize: 7.0, align: 'center' });
  y += lineH(usedAce1) - 1;
  const aceSite = drawWrapped('Website: acestudiosus.com', margins.left, y, W, { maxSize: 8.0, align: 'center' });
  y += aceSite.height;
  const aceContact = drawWrapped(`Contact: ${ACE_STUDIOS_CONTACT}`, margins.left, y, W, { maxSize: 8.0, align: 'center' });
  y += aceContact.height + 1;

  // Trim height with safety buffer to avoid bottom cut
  const needed = y + margins.bottom + 16;
  if (needed < doc.page.height) doc.page.height = needed;

  doc.end();
  await new Promise<void>((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  // True-size printing (no scaling)
  for (let i = 0; i < copies; i++) {
    await print(tmp, { printer: printer.name, scale: 'noscale' as any });
  }
  fs.unlink(tmp, () => {});
  return { success: true, copies, printer: printer.name };
}
