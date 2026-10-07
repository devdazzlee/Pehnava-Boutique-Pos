// src/services/label-pdf.service.ts
import fs from 'fs';
import os from 'os';
import path from 'path';
import PDFDocument from 'pdfkit';
import { print } from 'pdf-to-printer';
import * as bwipjs from 'bwip-js';
import { encodeLabelBarcodeValue } from '../utils/numericBarcodeSku';
import { formatBarcodeLabelTitle } from '../utils/labelTitle';

const formatLabelPrice = (price?: number) => {
  const n = Number(price);
  if (!Number.isFinite(n)) return '';
  return `PRICE ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

type PaperSize = '3x2inch' | '50x30mm' | '60x40mm';
type Dpi = 203 | 300;

export interface LabelItem {
  id: string;
  name: string;
  /** Encoded payload for Code128 (legacy callers may send this alone). */
  barcode: string;
  /** When set with optional `code` / `price`, barcode image uses same rules as POS labels (9-digit SKU). */
  sku?: string;
  code?: string;
  netWeight?: string;
  price?: number;
  packageDateISO?: string;
  expiryDateISO?: string;
}

export interface PrintLabelsInput {
  printerName: string;
  items: LabelItem[];
  paperSize?: PaperSize;
  copies?: number;
  dpi?: Dpi;
  humanReadable?: boolean;
}

const mm = (n: number) => n * 2.83464567;

function pageSize(p: PaperSize) {
  // Physical label size AS IT FEEDS through printer
  // For 3x2" labels: 3" is WIDTH (horizontal), 2" is HEIGHT (vertical)
  if (p === '50x30mm') return { w: mm(50), h: mm(30) };
  if (p === '60x40mm') return { w: mm(60), h: mm(40) };
  return { w: mm(76.2), h: mm(50.8) }; // 3" x 2"
}

const shortDate = (iso?: string) =>
  !iso ? '__/__/____' :
  new Date(iso).toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'});

export async function printBarcodeLabels(input: PrintLabelsInput) {
  const paper = input.paperSize ?? '3x2inch';
  const dpi   = input.dpi ?? 203;
  const copies = Math.max(1, input.copies ?? 1);
  const human = !!input.humanReadable;

  // Get physical label dimensions
  const { w: PW, h: PH } = pageSize(paper);

  // Minimal margins for Zebra
  const M = { left: mm(1.5), right: mm(1.5), top: mm(1.5), bottom: mm(1.5) };
  
  // Content area (this is what we draw in)
  const CW = PW - M.left - M.right;
  const CH = PH - M.top - M.bottom;

  const tmp = path.join(os.tmpdir(), `labels_${Date.now()}.pdf`);
  
  // Create PDF with PORTRAIT orientation matching physical label
  const doc = new PDFDocument({ 
    size: [PW, PH],
    margins: { left: 0, right: 0, top: 0, bottom: 0 }, // We'll handle margins manually
    autoFirstPage: false 
  });
  
  const stream = fs.createWriteStream(tmp);
  doc.pipe(stream);

  // Font sizes
  const TITLE = paper === '3x2inch' ? 14 : 11;
  const META  = paper === '3x2inch' ? 10 : 9;
  const PRICE = paper === '3x2inch' ? 12 : 10;

  // Barcode dimensions
  const BAR_W_MAX = CW * 0.88;
  const BAR_H_MM  = paper === '3x2inch' ? 14 : 11;
  const SCALE     = dpi === 300 ? 6 : 5;

  for (const it of input.items) {
    for (let c = 0; c < copies; c++) {
      doc.addPage();

      // Start drawing from top-left with margins
      let y = M.top;
      const leftMargin = M.left;
      const contentWidth = CW;

      // ---- TITLE (Product Name) ----
      doc.font('Helvetica-Bold').fontSize(TITLE);
      let title = formatBarcodeLabelTitle(it.name || '');
      let fontSize = TITLE;
      
      // Auto-shrink title if too wide
      while (fontSize > 7 && doc.widthOfString(title) > contentWidth * 0.98) { 
        fontSize -= 0.3; 
        doc.fontSize(fontSize); 
      }
      
      const titleWidth = doc.widthOfString(title);
      const titleX = leftMargin + (contentWidth - titleWidth) / 2;
      doc.text(title, titleX, y, { width: contentWidth, align: 'center', lineBreak: false });
      y += doc.heightOfString(title, { width: contentWidth }) + mm(1);

      // ---- META ROW (Weight & Price) ----
      doc.font('Helvetica').fontSize(META);
      if (it.netWeight) {
        doc.font('Helvetica').fontSize(META);
        doc.text(`NET WT: ${it.netWeight}`, leftMargin, y, { width: contentWidth, align: 'center', lineBreak: false });
        y += doc.heightOfString('Ag') + mm(0.8);
      }
      if (Number.isFinite(it.price)) {
        doc.font('Helvetica-Bold').fontSize(PRICE);
        doc.text(formatLabelPrice(it.price), leftMargin, y, { width: contentWidth, align: 'center', lineBreak: false });
        y += doc.heightOfString('Ag') + mm(1);
      }

      // ---- BARCODE ----
      try {
        const priceInt = Math.round(Number(it.price ?? 0));
        const hasSkuOrCode =
          (it.sku !== undefined && it.sku !== null && String(it.sku).trim() !== '') ||
          (it.code !== undefined && it.code !== null && String(it.code).trim() !== '');
        const barcodeText = hasSkuOrCode
          ? encodeLabelBarcodeValue(it.sku, it.code, priceInt)
          : String(it.barcode);

        const png: Buffer = await new Promise((res, rej) => {
          bwipjs.toBuffer(
            { 
              bcid: 'code128', 
              text: barcodeText, 
              scale: SCALE, 
              height: BAR_H_MM, 
              includetext: human, 
              textxalign: 'center', 
              backgroundcolor: 'FFFFFF' 
            },
            (err, buf) => err ? rej(typeof err === 'string' ? new Error(err) : err) : res(buf)
          );
        });

        // Read PNG dimensions
        let pngWidth = 1, pngHeight = 1;
        try { 
          if (png.length > 24) { 
            pngWidth = png.readUInt32BE(16); 
            pngHeight = png.readUInt32BE(20); 
          } 
        } catch {}
        
        const aspectRatio = pngHeight / pngWidth;

        // Calculate barcode size to fit remaining space
        const remainingHeight = (M.top + CH) - y;
        
        let barcodeWidth = BAR_W_MAX;
        let barcodeHeight = barcodeWidth * aspectRatio;

        // Ensure barcode fits vertically
        if (barcodeHeight > remainingHeight * 0.92) { 
          barcodeHeight = remainingHeight * 0.92; 
          barcodeWidth = barcodeHeight / aspectRatio; 
        }

        // Center barcode horizontally and vertically in remaining space
        const barcodeX = leftMargin + (contentWidth - barcodeWidth) / 2;
        const barcodeY = y + (remainingHeight - barcodeHeight) / 2;

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
  
  await new Promise<void>((resolve, reject) => {
    stream.once('finish', resolve);
    stream.once('error', reject);
  });

  await print(tmp, { 
    printer: input.printerName, 
    scale: 'noscale' as any 
  });
  
  fs.unlink(tmp, () => {});
  return { success: true };
}