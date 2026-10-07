// src/services/barcode.service.ts (CMD-only)
import os from 'os';
import fs from 'fs';
import path from 'path';
import util from 'util';
import { execFile } from 'child_process';
const execFileAsync = util.promisify(execFile);
import { encodeLabelBarcodeValue } from '../utils/numericBarcodeSku';
import { formatBarcodeLabelTitle } from '../utils/labelTitle';

export interface PrinterInfo {
  name: string;
  shareName?: string | null;
  isDefault: boolean;
  status: 'available' | 'offline' | 'unknown';
  portName?: string | null;
}

type BuildItemsInput = {
  printerName: string;
  copies?: number;
  dpi?: 203 | 300;
  paperSize?: '50x30mm' | '60x40mm' | '40x25mm';
  humanReadable?: boolean;
  items: Array<{
    id: string; name: string; sku?: string; code?: string;
    barcode: string; netWeight?: string; price?: number;
    packageDateISO?: string; expiryDateISO?: string;
  }>;
};

export class BarcodeService {
  // ---- Discover printers - Platform agnostic ----
  async getAvailablePrinters(): Promise<PrinterInfo[]> {
    const platform = process.platform;
    
    // Linux/macOS detection
    if (platform === 'linux' || platform === 'darwin') {
      try {
        const { stdout: allPrinters } = await execFileAsync('lpstat', ['-p'], { timeout: 5000 });
        let defaultPrinterName: string | null = null;
        
        try {
          const { stdout: defaultOutput } = await execFileAsync('lpstat', ['-d'], { timeout: 5000 });
          const match = defaultOutput.match(/system default destination: (\S+)/);
          if (match) defaultPrinterName = match[1];
        } catch {}

        const printerNames = allPrinters
          .split('\n')
          .filter(line => line.trim() && line.includes('printer'))
          .map(line => {
            const match = line.match(/printer (\S+) is/);
            return match ? match[1] : null;
          })
          .filter(name => name !== null);

        if (printerNames.length > 0) {
          return printerNames.map((name: any) => ({
            name,
            shareName: null,
            isDefault: name === defaultPrinterName,
            status: 'available' as const,
            portName: null,
          }));
        }
      } catch (error) {
        console.log('Linux printer detection failed, returning default');
      }
      
      // Return default for Linux if detection fails
      return [{ name: 'Default Printer', shareName: null, isDefault: true, status: 'available', portName: null }];
    }
    
    // Windows detection using WMIC
    const { stdout } = await execFileAsync('wmic', [
      'printer', 'get',
      'Name,ShareName,Default,PrinterStatus,PortName',
      '/format:csv'
    ], { windowsHide: true, timeout: 8000, maxBuffer: 10 * 1024 * 1024 });

    const lines = stdout.split(/\r?\n/).filter(Boolean).slice(1); // skip header
    const list: PrinterInfo[] = [];
    for (const line of lines) {
      // CSV: Node,Default,Name,PortName,PrinterStatus,ShareName
      const parts = line.split(',');
      const Default = parts[1];
      const Name = parts[2];
      const PortName = parts[3];
      const PrinterStatus = Number(parts[4] || 0);
      const ShareName = parts[5] || '';

      if (!Name) continue;
      list.push({
        name: Name,
        shareName: ShareName || null,
        isDefault: Default === 'TRUE',
        status: (PrinterStatus === 0 || PrinterStatus === 3) ? 'available'
               : (PrinterStatus === 1 ? 'offline' : 'unknown'),
        portName: PortName || null
      });
    }

    // fallback default from registry if WMIC didn’t mark any default
    if (!list.some(p => p.isDefault)) {
      try {
        const { stdout: regOut } = await execFileAsync('reg', [
          'query', 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows', '/v', 'Device'
        ], { windowsHide: true, timeout: 4000 });
        const line = regOut.split(/\r?\n/).find(l => l.includes('REG_SZ'));
        const val = line?.split('REG_SZ').pop()?.trim() || '';
        const defName = val.split(',')[0]?.trim();
        if (defName) {
          const p = list.find(x => x.name.toLowerCase() === defName.toLowerCase());
          if (p) p.isDefault = true;
        }
      } catch {}
    }

    // sort: default first
    return list.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
  }

  // ---- Build ZPL for items (same as before) ----
  buildZPLForItems(input: BuildItemsInput): string {
    const dpi = input.dpi ?? 203;
    const dims = {
      '50x30mm': { w: Math.round(50/25.4 * dpi), h: Math.round(30/25.4 * dpi) },
      '60x40mm': { w: Math.round(60/25.4 * dpi), h: Math.round(40/25.4 * dpi) },
      '40x25mm': { w: Math.round(40/25.4 * dpi), h: Math.round(25/25.4 * dpi) },
    }[input.paperSize ?? '50x30mm'];
    const HRI = input.humanReadable ? 'Y' : 'N';

    const blocks: string[] = [];
    for (const it of input.items) {
      const title = formatBarcodeLabelTitle(it.name || '').slice(0, 26);
      const wt    = it.netWeight ? `NET WT: ${it.netWeight}` : '';
      const price = Number.isFinite(it.price) ? `RS ${Math.round(it.price!)}` : '';
      const pkg   = it.packageDateISO ? new Date(it.packageDateISO).toLocaleDateString('en-GB') : '';
      const exp   = it.expiryDateISO ? new Date(it.expiryDateISO).toLocaleDateString('en-GB') : '';

      blocks.push(
`^XA
^PW${dims.w}
^LL${dims.h}
^LH0,0
^CI28
^CF0,28
^FO10,10^FB${dims.w-20},2,0,L,0^FD${title}^FS
^CF0,26
^FO${dims.w-160},10^FB150,1,0,R,0^FD${price}^FS
^BY2,2,60
^FO10,80^BCN,60,${HRI},N,N
^FD${encodeLabelBarcodeValue(it.sku, it.code, Math.round(Number(it.price ?? 0)))}^FS
^CF0,20
^FO10,150^FD${wt}^FS
^CF0,18
^FO10,170^FDPKG: ${pkg}^FS
^FO${dims.w-160},170^FDEXP: ${exp}^FS
^XZ`
      );
    }
    const copies = input.copies ?? 1;
    return Array(copies).fill(blocks.join('\n')).join('\n');
  }

  // ---- Send RAW ZPL without PowerShell ----
  async printZPLRaw(args: { printerName: string; zpl: string; copies?: number }) {
    const { printerName, zpl } = args;

    const file = path.join(os.tmpdir(), `zpl_${Date.now()}_${Math.random().toString(36).slice(2)}.zpl`);
    await fs.promises.writeFile(file, zpl, 'utf8');

    // Prefer UNC if the queue is shared, else use PRINT.EXE with queue name.
    let target = printerName;
    if (!/^\\\\/i.test(printerName)) {
      try {
        const list = await this.getAvailablePrinters();
        const p = list.find(x => x.name.toLowerCase() === printerName.toLowerCase());
        if (p?.shareName) target = `\\\\localhost\\${p.shareName}`;
      } catch {}
    }

    const attempts: Array<{ cmd: string; args: string[]; label: string }> = [];
    if (/^\\\\/i.test(target)) attempts.push({ cmd: 'cmd.exe', args: ['/c', 'copy', '/b', file, target], label: 'COPY /B to UNC' });
    attempts.push({ cmd: 'print', args: ['/D:' + `"${printerName}"`, file], label: 'PRINT /D to Queue' });

    let lastErr: any = null;
    for (const a of attempts) {
      try {
        await execFileAsync(a.cmd, a.args, { windowsHide: true, timeout: 15000, cwd: path.dirname(file) });
        await fs.promises.unlink(file).catch(() => {});
        return;
      } catch (e) { lastErr = e; }
    }
    await fs.promises.unlink(file).catch(() => {});
    throw new Error(`RAW send failed. Last error: ${lastErr?.stderr || lastErr?.message || lastErr}`);
  }
}

// Standalone functions for simpler ZPL printing
function buildZplLabel(p: {
  code: string; title: string; netWt: string; price: string;
  pkg: string; exp: string;
}) {
  return `^XA
^CI28
^PW609
^LL406
^LH0,0
^FWN
^CF0,28
^FO20,15^FD${p.title}^FS
^CF0,22
^FO20,55^FDWt: ${p.netWt}^FS
^FO320,55^FDRs ${p.price}^FS
^BY3,3,180
^FO30,95
^BCN,180,N,N,N
^FD${p.code}^FS
^CF0,20
^FO20,290^FDPKG: ${p.pkg}^FS
^FO320,290^FDEXP: ${p.exp}^FS
^XZ`;
}

export async function printZplRaw(printerName: string, zpl: string) {
  // Use Windows print.exe to send RAW to a named printer queue.
  // We write ZPL to a temp file then print it RAW (driver will not rasterize/rotate).
  const tmp = path.join(os.tmpdir(), `label_${Date.now()}.zpl`);
  await fs.promises.writeFile(tmp, zpl, "utf8");

  // /D:"queue name" must match exactly the printer name shown in Control Panel.
  // /t sends RAW without formatting.
  await execFileAsync("PRINT", ["/D:" + printerName, "/t", tmp], { windowsHide: true });

  // Best-effort cleanup
  fs.promises.unlink(tmp).catch(() => {});
}

export function buildLabelsZpl(items: Array<{
  name: string; sku?: string; code?: string;
  netWeight: string; price: number; packageDateISO: string; expiryDateISO?: string;
}>) {
  return items.map((it) =>
    buildZplLabel({
      code: encodeLabelBarcodeValue(it.sku, it.code, Math.round(it.price)),
      title: formatBarcodeLabelTitle(it.name).slice(0, 28),
      netWt: it.netWeight,
      price: Math.round(it.price).toString(),
      pkg: new Date(it.packageDateISO).toLocaleDateString("en-GB"),
      exp: it.expiryDateISO
        ? new Date(it.expiryDateISO).toLocaleDateString("en-GB")
        : "__/__/____",
    })
  ).join("\n");
}