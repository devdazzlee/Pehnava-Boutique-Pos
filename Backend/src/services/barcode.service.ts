import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';
import util from 'util';
const execFileAsync = util.promisify(execFile);
import { ThermalPrinter, PrinterTypes } from 'node-thermal-printer';
const PrinterDriver = require('node-printer');

const execAsync = promisify(exec);

interface Product {
  id: string;
  name: string;
  sku?: string;
  code?: string;
  sales_rate_exc_dis_and_tax?: number;
  netWeight: string;
  packageDate: string;
  expiryDate: string;
}

type PrintJobInput = {
  printer: {
    name: string;
    languageHint?: 'escpos' | 'zpl' | 'generic';
    columns?: { fontA: number; fontB: number };
  };
  job?: { copies?: number; cut?: boolean; openDrawer?: boolean };
  receiptData: any;
};

interface PrinterInfo {
  name: string;
  id: string;
  isDefault: boolean;
  status: 'available' | 'offline' | 'unknown';
  workOffline?: boolean;
  printerStatus?: number;
  serverName?: string | null;
  shareName?: string | null;
  port?: { name?: string | null; host?: string | null } | null;
  driver?: { name?: string | null; version?: string | null; manufacturer?: string | null } | null;
  defaults?: {
    paperSize?: string | null;
    pageWidthMM?: number | null;
    pageHeightMM?: number | null;
    orientation?: string | null;
    dpi?: { x?: number | null; y?: number | null } | null;
  } | null;
  languageHint?: 'escpos' | 'zpl' | 'generic';
  receiptProfile?: {
    roll: '80mm' | '58mm';
    printableWidthMM: number;
    columns: { fontA: number; fontB: number };
  };
}

function safeParseJson<T = any>(text: string): T | null {
  try { return JSON.parse(text); } catch { return null; }
}

async function getPrintersViaCIM(): Promise<PrinterInfo[]> {
  const ps = [
    '-NoProfile',
    '-Command',
    `$p = Get-CimInstance Win32_Printer | Select-Object Name,Default,WorkOffline,PrinterStatus,DriverName,PortName,ServerName,ShareName;
     $p | ConvertTo-Json -Compress -Depth 3`
  ];
  const { stdout } = await execFileAsync('powershell', ps, { timeout: 5000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
  const data = safeParseJson(stdout);
  if (!data) return [];

  const items = Array.isArray(data) ? data : [data];
  return items.map((p: any) => ({
    name: p.Name,
    id: `${String(p.Name).toLowerCase().replace(/\s+/g, '-')}@${process.env.COMPUTERNAME || 'local'}`,
    isDefault: !!p.Default,
    status: p.WorkOffline ? 'offline' : ((p.PrinterStatus === 3 || p.PrinterStatus === 0 || p.PrinterStatus == null) ? 'available' : 'unknown'),
    workOffline: !!p.WorkOffline,
    printerStatus: p.PrinterStatus ?? null,
    serverName: p.ServerName ?? null,
    shareName: p.ShareName ?? null,
    // fill driver/port shallowly; we’ll enrich soon
    driver: { name: p.DriverName ?? null, version: null, manufacturer: null },
    port: { name: p.PortName ?? null, host: null },
    defaults: null
  } as PrinterInfo));
}
async function enrichPrinterInfo(printerName: string): Promise<Partial<PrinterInfo>> {
  const ps = `
$pn = '${printerName.replace(/'/g, "''")}';
$pr = Get-CimInstance Win32_Printer -Filter "Name='$pn'";
$cfg = Get-PrintConfiguration -PrinterName $pn -ErrorAction SilentlyContinue;
$drv = if ($pr -and $pr.DriverName) { Get-PrinterDriver -Name $pr.DriverName -ErrorAction SilentlyContinue } else { $null };
$port = if ($pr -and $pr.PortName) { Get-PrinterPort -Name $pr.PortName -ErrorAction SilentlyContinue } else { $null };
$ip = $null; if ($port -and $port.PrinterHostAddress) { $ip = $port.PrinterHostAddress; }

[pscustomobject]@{
  Driver = if ($drv) { [pscustomobject]@{ Name=$drv.Name; Version=$drv.DriverVersion; Manufacturer=$drv.Manufacturer } } else { $null }
  Port = if ($pr) { [pscustomobject]@{ Name=$pr.PortName; Host=$ip } } else { $null }
  Defaults = if ($cfg) {
    [pscustomobject]@{
      PaperSize = $cfg.PaperSize
      PageWidthMM = if ($cfg.PageSize.Width) { [math]::Round($cfg.PageSize.Width/1000,0) } else { $null }
      PageHeightMM = if ($cfg.PageSize.Height){ [math]::Round($cfg.PageSize.Height/1000,0)} else { $null }
      Orientation = $cfg.PageOrientation
      Dpi = [pscustomobject]@{ x = $cfg.ResolutionX; y = $cfg.ResolutionY }
    }
  } else { $null }
} | ConvertTo-Json -Depth 5 -Compress
`;
  const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-Command', ps], { timeout: 6000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
  const data = safeParseJson(stdout) || {};
  return {
    driver: data.Driver ?? null,
    port: data.Port ?? null,
    defaults: data.Defaults ?? null,
  };
}
async function getPrintersViaGetPrinter() {
  const ps = [
    '-NoProfile',
    '-Command',
    `$p = Get-Printer | Select-Object Name, PrinterStatus, WorkOffline;
     $p | ConvertTo-Json -Compress -Depth 3`
  ];
  const { stdout } = await execFileAsync('powershell', ps, { timeout: 5000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
  const data = safeParseJson(stdout);
  if (!data) return [];
  const items = Array.isArray(data) ? data : [data];
  // No default info here — we’ll compute default separately if needed.
  return items.map((p: any) => ({
    name: p.Name,
    isDefault: false,
    status:
      p.WorkOffline ? 'offline'
        : (p.PrinterStatus === 3 || p.PrinterStatus === 0 || p.PrinterStatus == null) ? 'available'
          : 'unknown'
  }));
}

async function getDefaultPrinterFromRegistryHKCU() {
  // HKCU default printer: "Device" value like: "Printer Name,winspool,NeXX:"
  const cmd = [
    'reg',
    'query',
    'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows',
    '/v',
    'Device'
  ];
  const { stdout } = await execFileAsync(cmd[0], cmd.slice(1), { timeout: 4000, windowsHide: true });
  // Parse the line that contains "Device    REG_SZ    <value>"
  const line = stdout.split(/\r?\n/).find(l => l.includes('REG_SZ'));
  if (!line) return null;
  const val = line.split('REG_SZ').pop()?.trim() || '';
  // Extract printer name before first comma
  const name = val.split(',')[0]?.trim() || null;
  return name || null;
}

function normalizeAndSort(
  printers: Array<PrinterInfo>,
  defaultName?: string | null
) {
  const map = new Map<string, PrinterInfo>();
  for (const p of printers) {
    const key = p.name.trim();
    const prev = map.get(key);
    map.set(key, {
      ...prev,
      ...p,
      isDefault: p.isDefault || prev?.isDefault || (defaultName ? key === defaultName : false),
    });
  }
  const list = Array.from(map.values());
  list.sort((a, b) => (Number(b.isDefault) - Number(a.isDefault)) || a.name.localeCompare(b.name));
  return list;
}


function deriveLanguageHint(p: Partial<PrinterInfo>) {
  const s = `${p.driver?.name || ''} ${p.name || ''}`.toLowerCase();
  if (/\(epl\)|\bepl\b|eltron|\blp\s*2844\b|lp2844|ups lp/.test(s)) return 'epl';
  if (s.includes('zebra') || s.includes('zdesigner')) return 'zpl';
  if (s.includes('generic') || s.includes('escpos') || s.includes('blackcopper') || s.includes('80mm') || s.includes('58mm')) return 'escpos';
  return 'generic';
}

function deriveLabelProfile(p: Partial<PrinterInfo>) {
  const hint = deriveLanguageHint(p);
  if (hint === 'epl' || hint === 'zpl') {
    return {
      paperSize: '58x40mm' as const,
      widthMM: 58,
      heightMM: 40,
      dpi: 203 as const,
      language: hint,
      model: hint === 'epl' ? 'Eltron LP 2844 (EPL)' : 'Zebra (ZPL)',
    };
  }
  return null;
}

// Windows ships a handful of virtual "printers" (Print to PDF, XPS Writer,
// Fax, OneNote) that are not real output devices. Sending a job to any of
// them makes Windows pop up a native "Save As" dialog on the machine for
// every single print — there is no supported way to suppress it. Never let
// these be selectable as the receipt printer.
const VIRTUAL_PRINTER_PATTERNS = [
  /microsoft print to pdf/i,
  /microsoft xps document writer/i,
  /^fax$/i,
  /onenote/i,
];
const isVirtualPrinter = (name?: string | null) => VIRTUAL_PRINTER_PATTERNS.some((re) => re.test(name || ''));

function deriveReceiptProfile(p: Partial<PrinterInfo>) {
  const w = p.defaults?.pageWidthMM ?? null;
  const name = (p.name || '').toLowerCase();
  const roll: '80mm' | '58mm' =
    name.includes('80') || (w !== null && w >= 70) ? '80mm' : '58mm';
  const printableWidthMM = roll === '80mm' ? 72 : 48; // conservative safe area
  const columns = roll === '80mm' ? { fontA: 48, fontB: 64 } : { fontA: 32, fontB: 42 };
  return { roll, printableWidthMM, columns };
}


export class BarcodeService {
  // Get available printers using Windows command
  async getAvailablePrinters(): Promise<PrinterInfo[]> {
    try {
      // 1) Primary: CIM
      const cimPrinters = await getPrintersViaCIM().catch(() => []);
      let printers: PrinterInfo[] = [];
      if (cimPrinters.length) {
        printers = normalizeAndSort(cimPrinters);
      } else {
        // 2) Fallback: Get-Printer + default from HKCU
        const [gpPrintersRaw, defName] = await Promise.all([
          getPrintersViaGetPrinter().catch(() => []),
          getDefaultPrinterFromRegistryHKCU().catch(() => null),
        ]);
        // ensure id field
        const gpPrinters = gpPrintersRaw.map((p: any) => ({
          ...p,
          id: `${String(p.name).toLowerCase().replace(/\s+/g, '-')}@${process.env.COMPUTERNAME || 'local'}`
        })) as PrinterInfo[];
        if (gpPrinters.length) {
          printers = normalizeAndSort(gpPrinters, defName);
        } else {
          // 3) Registry enumerate names
          const { stdout } = await execFileAsync('reg', ['query', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Print\\Printers'], { timeout: 5000, windowsHide: true });
          const names = new Set<string>();
          stdout.split(/\r?\n/).forEach(line => {
            const m = line.match(/Printers\\([^\\\r\n]+)/);
            if (m?.[1]) names.add(m[1]);
          });
          const def = await getDefaultPrinterFromRegistryHKCU().catch(() => null);
          const regPrinters: PrinterInfo[] = Array.from(names).map(name => ({
            name,
            id: `${name.toLowerCase().replace(/\s+/g, '-')}@${process.env.COMPUTERNAME || 'local'}`,
            isDefault: false,
            status: 'available',
          })) as PrinterInfo[];
          printers = normalizeAndSort(regPrinters, def);
        }
      }

      // Drop virtual printers (Print to PDF, XPS, Fax, OneNote) — see
      // isVirtualPrinter for why these can never be a valid receipt printer.
      printers = printers.filter((p) => !isVirtualPrinter(p.name));

      if (!printers.length) {
        return [{ name: 'Default Printer', id: 'default@local', isDefault: true, status: 'available' }];
      }

      // 6.a) Enrich in parallel (limit concurrency to avoid PS storms)
      const limit = 3;
      const out: PrinterInfo[] = [];
      for (let i = 0; i < printers.length; i += limit) {
        const chunk = printers.slice(i, i + limit);
        const enriched = await Promise.all(chunk.map(async p => {
          try {
            const extra = await enrichPrinterInfo(p.name);
            const merged: PrinterInfo = {
              ...p,
              driver: extra.driver ?? p.driver ?? null,
              port: extra.port ?? p.port ?? null,
              defaults: extra.defaults ?? p.defaults ?? null,
            };
            merged.languageHint = deriveLanguageHint(merged);
            merged.receiptProfile = deriveReceiptProfile(merged);
            (merged as any).labelProfile = deriveLabelProfile(merged);
            return merged;
          } catch {
            const merged: PrinterInfo = {
              ...p,
              languageHint: deriveLanguageHint(p),
              receiptProfile: deriveReceiptProfile(p),
            };
            (merged as any).labelProfile = deriveLabelProfile(merged);
            return merged;
          }
        }));
        out.push(...enriched);
      }

      return out;
    } catch (e) {
      logger.error('Error getting printers (enriched):', e);
      return [{ name: 'Default Printer', id: 'default@local', isDefault: true, status: 'available' }];
    }
  }

  private calculatePriceByWeight(netWeightInput: any, basePrice: any): number {
    if (!netWeightInput || !basePrice) return basePrice || 0;

    const input = netWeightInput.toLowerCase().trim();
    const numberMatch = input.match(/(\d+\.?\d*)/);
    if (!numberMatch) return basePrice;

    const weightValue = Number.parseFloat(numberMatch[1]);
    if (weightValue <= 0) return basePrice;

    let multiplier = 1;

    if (input.includes("kg") || input.includes("kilo")) {
      multiplier = weightValue;
    } else if (
      input.includes("g") &&
      !input.includes("kg") &&
      !input.includes("mg")
    ) {
      multiplier = weightValue / 1000;
    } else if (input.includes("mg")) {
      multiplier = weightValue / 1000000;
    } else if (input.includes("lb") || input.includes("pound")) {
      multiplier = weightValue * 0.453592;
    } else if (input.includes("oz") && !input.includes("fl")) {
      multiplier = weightValue * 0.0283495;
    } else if (
      input.includes("l") &&
      !input.includes("ml") &&
      !input.includes("fl")
    ) {
      multiplier = weightValue;
    } else if (input.includes("ml") || input.includes("milliliter")) {
      multiplier = weightValue / 1000;
    } else if (input.includes("ser") || input.includes("seer")) {
      multiplier = weightValue * 0.933105;
    } else if (input.includes("maund")) {
      multiplier = weightValue * 37.3242;
    } else if (
      input.includes("pc") ||
      input.includes("piece") ||
      input.includes("pcs")
    ) {
      multiplier = weightValue;
    } else if (input.includes("dozen")) {
      multiplier = weightValue * 12;
    } else {
      multiplier = weightValue / 1000;
    }

    const finalPrice = basePrice * multiplier;
    return Number(finalPrice.toFixed(2));
  }

  private formatWeightDisplay(netWeightInput: any): string {
    if (!netWeightInput) return "Not specified";

    const input = netWeightInput.toLowerCase().trim();
    const numberMatch = input.match(/(\d+\.?\d*)/);
    if (!numberMatch) return netWeightInput;

    const number = Number.parseFloat(numberMatch[1]);

    if (input.includes("kg")) return `${number}kg`;
    if (input.includes("g") && !input.includes("kg") && !input.includes("mg"))
      return `${number}g`;
    if (input.includes("mg")) return `${number}mg`;
    if (input.includes("lb")) return `${number}lb`;
    if (input.includes("oz") && !input.includes("fl")) return `${number}oz`;
    if (input.includes("l") && !input.includes("ml")) return `${number}L`;
    if (input.includes("ml")) return `${number}ml`;
    if (input.includes("ser")) return `${number} seer`;
    if (input.includes("maund")) return `${number} maund`;
    if (input.includes("pc") || input.includes("piece")) return `${number} pcs`;
    if (input.includes("dozen")) return `${number} dozen`;

    return `${number}g`;
  }

  private formatDate(date: Date): string {
    if (!date) return "__/__/____";
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  async printReceipt(input: PrintJobInput) {
    const { printer, job, receiptData } = input;
    const columns = printer.columns ?? { fontA: 48, fontB: 64 }; // safe default for 80mm
    const copies = job?.copies ?? 1;
    const cut = job?.cut ?? true;
    const openDrawer = job?.openDrawer ?? false;

    // USB queue on Windows
    const tp = new ThermalPrinter({
      type: PrinterTypes.EPSON,                       // ESC/POS
      interface: `printer:${printer.name}`,           // ← local Windows queue
      driver: PrinterDriver,                          // ← REQUIRED for printer: scheme
      options: { timeout: 6000 },
      removeSpecialCharacters: false,
      lineCharacter: '='
    });


    const twoCol = (left: string, right: string) => {
      const width = columns.fontA;
      // Trim to max and keep at least one space
      left = (left ?? '').toString();
      right = (right ?? '').toString();
      const pad = Math.max(1, width - left.length - right.length);
      return left + ' '.repeat(pad) + right;
    };

    // ====== Layout ======
    await tp.alignCenter();
    await tp.setTextDoubleHeight(); await tp.setTextDoubleWidth();
    await tp.println((receiptData.storeName || 'Pehnawa Boutique').toUpperCase());
    await tp.setTextNormal();
    await tp.println(receiptData.tagline || 'Elegance, crafted for every moment.');
    await tp.println(receiptData.address || 'Shop No: 18C, Tariq Rd, opposite Tariq Center, P.E.C.H.S Block 2 Block 2 P.E.C.H.S., Karachi, 70400');
    await tp.drawLine();

    const ts = new Date(receiptData.timestamp || Date.now());
    await tp.alignLeft();
    await tp.println(`Receipt: ${receiptData.transactionId}`);
    await tp.println(`Date: ${ts.toLocaleDateString()} ${ts.toLocaleTimeString()}`);
    await tp.println(`Cashier: ${receiptData.cashier || 'Walk-in'}   Customer: ${receiptData.customerType || 'Walk-in'}`);
    await tp.drawLine();

    // Items
    await tp.println(twoCol('ITEM                 QTY', 'AMOUNT'));
    await tp.drawLine();
    for (const it of receiptData.items || []) {
      const name = String(it.name ?? '').slice(0, columns.fontA); // clip
      const qty = (it.quantity ?? 0).toString();
      const amt = `PKR ${(Number(it.price ?? 0) * Number(it.quantity ?? 0)).toFixed(2)}`;
      await tp.println(twoCol(`${name} ${qty}x`, amt));
      // Long name on next line if clipped:
      if (it.name && it.name.length > name.length) {
        await tp.println(it.name);
      }
    }
    await tp.drawLine();

    const subtotal = Number(receiptData.subtotal ?? 0);
    const discount = Number(receiptData.discount ?? 0);
    const total = Number(receiptData.total ?? Math.max(0, subtotal - discount));

    await tp.println(twoCol('Subtotal', `PKR ${subtotal.toFixed(2)}`));
    if (discount > 0) await tp.println(twoCol('Discount', `PKR ${discount.toFixed(2)}`));
    await tp.setTextDoubleWidth();
    await tp.println(twoCol('TOTAL', `PKR ${total.toFixed(2)}`));
    await tp.setTextNormal();
    await tp.drawLine();

    await tp.println(twoCol('Payment', (receiptData.paymentMethod || 'CASH').toUpperCase()));
    if (receiptData.amountPaid != null) await tp.println(twoCol('Paid', `PKR ${Number(receiptData.amountPaid).toFixed(2)}`));
    if (receiptData.changeAmount > 0) await tp.println(twoCol('Change', `PKR ${Number(receiptData.changeAmount).toFixed(2)}`));

    await tp.newLine();
    await tp.alignCenter();
    await tp.println(receiptData.thankYouMessage || 'Thank you for shopping with us!');
    await tp.println('Call / WhatsApp: 03013181111');
    await tp.println('Website: pehnawastore.pk');
    await tp.println('Shop No: 18C, Tariq Rd, opposite Tariq Center, P.E.C.H.S Block 2 Block 2 P.E.C.H.S., Karachi, 70400');
    if (receiptData.footerMessage) await tp.println(receiptData.footerMessage);

    // Optional barcode (ESC/POS Code128)
    if (receiptData.transactionId) {
      await tp.newLine();
      await tp.printBarcode(String(receiptData.transactionId), 73, { width: 2, height: 80, hriPos: 2 });
    }

    if (openDrawer) {
      // ESC/POS kick cash drawer (might vary per printer)
      await tp.openCashDrawer();
    }
    if (cut) await tp.cut();

    // Copies
    let ok = true;
    for (let i = 0; i < copies; i++) {
      const res = await tp.execute();
      ok = ok && !!res;
    }

    return {
      success: ok,
      printer: printer.name,
      copies,
      columns
    };
  }

}
