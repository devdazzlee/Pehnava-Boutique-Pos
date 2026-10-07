/**
 * Windows RAW label printing — no PowerShell (works as Windows service + all laptops).
 * 1) daemon/rawprint.exe (winspool, built at setup)
 * 2) koffi winspool fallback
 * 3) copy /b to COM/LPT port from registry (last resort)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);

const RAWPRINT_EXE = path.join(__dirname, '..', 'daemon', 'rawprint.exe');

function printerNameCandidates(printerName) {
  const base = String(printerName || '').trim();
  if (!base) return [];
  return [
    base,
    base.replace(/\s*\(EPL\)\s*/i, ''),
    base.replace(/\s*\(ZPL\)\s*/i, ''),
  ].filter((n, i, arr) => n && arr.indexOf(n) === i);
}

async function getPrinterPortFromRegistry(printerName) {
  try {
    const { stdout } = await execFileAsync(
      'reg',
      ['query', `HKLM\\SYSTEM\\CurrentControlSet\\Control\\Print\\Printers\\${printerName}`, '/v', 'Port'],
      { timeout: 8000, windowsHide: true }
    );
    const m = stdout.match(/Port\s+REG_SZ\s+(\S+)/i);
    return m?.[1] || null;
  } catch {
    return null;
  }
}

function ensureRawPrintExe() {
  if (fs.existsSync(RAWPRINT_EXE)) return RAWPRINT_EXE;
  const buildBat = path.join(__dirname, '..', 'tools', 'build-rawprint.bat');
  if (!fs.existsSync(buildBat)) return null;
  try {
    const { execSync } = require('child_process');
    execSync(`"${buildBat}"`, { windowsHide: true, cwd: path.dirname(buildBat) });
  } catch (e) {
    console.warn('[raw-print] build-rawprint.bat failed:', e.message);
  }
  return fs.existsSync(RAWPRINT_EXE) ? RAWPRINT_EXE : null;
}

async function sendViaRawPrintExe(printerName, tmpFile) {
  const exe = ensureRawPrintExe();
  if (!exe) return false;
  const { stdout, stderr } = await execFileAsync(exe, [printerName, tmpFile], {
    windowsHide: true,
    timeout: 30000,
  });
  const out = `${stdout || ''}${stderr || ''}`;
  if (out.includes('OK:')) return true;
  throw new Error(out.trim() || 'rawprint.exe failed');
}

let koffiModule = null;
function getKoffiRaw() {
  if (koffiModule !== null) return koffiModule;
  try {
    // eslint-disable-next-line global-require
    const koffi = require('koffi');
    const winspool = koffi.load('winspool.drv');
    const kernel32 = koffi.load('kernel32.dll');
    const GetLastError = kernel32.func('uint32 GetLastError()');

    const DOCINFOW = koffi.struct('DOCINFOW', {
      pDocName: 'str16',
      pOutputFile: 'str16',
      pDatatype: 'str16',
    });

    const OpenPrinterW = winspool.func(
      'bool OpenPrinterW(str16 pPrinterName, _Out_ void **phPrinter, void *pDefault)'
    );
    const ClosePrinter = winspool.func('bool ClosePrinter(void *hPrinter)');
    const StartDocPrinterW = winspool.func(
      'bool StartDocPrinterW(void *hPrinter, uint32 level, DOCINFOW *pDocInfo)'
    );
    const EndDocPrinter = winspool.func('bool EndDocPrinter(void *hPrinter)');
    const StartPagePrinter = winspool.func('bool StartPagePrinter(void *hPrinter)');
    const EndPagePrinter = winspool.func('bool EndPagePrinter(void *hPrinter)');
    const WritePrinter = winspool.func(
      'bool WritePrinter(void *hPrinter, void *pBuf, uint32 cbBuf, _Out_ uint32 *pcWritten)'
    );

    koffiModule = {
      send(printerName, buffer) {
        const ph = [null];
        if (!OpenPrinterW(printerName, ph, null)) {
          throw new Error(`OpenPrinterW failed (${GetLastError()}) for "${printerName}"`);
        }
        const h = ph[0];
        try {
          const di = koffi.alloc(DOCINFOW, 1);
          koffi.encode(di, DOCINFOW, {
            pDocName: 'Pehnava Label',
            pOutputFile: null,
            pDatatype: 'RAW',
          });
          if (!StartDocPrinterW(h, 1, di)) {
            throw new Error(`StartDocPrinterW failed (${GetLastError()})`);
          }
          if (!StartPagePrinter(h)) {
            throw new Error(`StartPagePrinter failed (${GetLastError()})`);
          }
          const written = [0];
          const ok = WritePrinter(h, buffer, buffer.length, written);
          EndPagePrinter(h);
          EndDocPrinter(h);
          if (!ok || written[0] <= 0) {
            throw new Error(`WritePrinter failed (${GetLastError()})`);
          }
          return written[0];
        } finally {
          ClosePrinter(h);
        }
      },
    };
  } catch (e) {
    console.warn('[raw-print] koffi unavailable:', e.message);
    koffiModule = false;
  }
  return koffiModule;
}

async function copyToPort(port, tmpFile) {
  const { exec } = require('child_process');
  const execAsync = util.promisify(exec);
  if (!port || port.startsWith('USB')) return false;
  const target = port.startsWith('COM') || port.startsWith('LPT') ? `\\\\.\\${port}` : port;
  try {
    const { stdout } = await execAsync(`copy /b "${tmpFile}" "${target}"`, {
      windowsHide: true,
      timeout: 15000,
    });
    return stdout && stdout.includes('file(s) copied') && !stdout.includes('0 file');
  } catch {
    return false;
  }
}

/**
 * Send EPL/ZPL bytes to a Windows printer queue.
 */
async function sendRawLabelToPrinter(printerName, rawContent, logTag = 'RAW') {
  if (process.platform !== 'win32') {
    throw new Error('RAW label printing is supported on Windows only');
  }

  const buffer = Buffer.from(rawContent, 'utf8');
  const names = printerNameCandidates(printerName);
  const tmpFile = path.join(os.tmpdir(), `label_${Date.now()}_${Math.random().toString(36).slice(2)}.lbl`);
  fs.writeFileSync(tmpFile, buffer);

  console.log(`[${logTag}] ${buffer.length} bytes, file ${tmpFile}`);
  console.log(`[${logTag}] Queues to try: ${names.join(' | ')}`);

  let lastError = null;

  try {
    for (const name of names) {
      try {
        await sendViaRawPrintExe(name, tmpFile);
        console.log(`[${logTag}] rawprint.exe → "${name}"`);
        return;
      } catch (e) {
        console.warn(`[${logTag}] rawprint.exe "${name}":`, e.message);
        lastError = e;
      }
    }

    const koffiRaw = getKoffiRaw();
    if (koffiRaw && koffiRaw !== false) {
      for (const name of names) {
        try {
          const n = koffiRaw.send(name, buffer);
          console.log(`[${logTag}] koffi winspool → "${name}" (${n} bytes)`);
          return;
        } catch (e) {
          console.warn(`[${logTag}] koffi "${name}":`, e.message);
          lastError = e;
        }
      }
    }

    for (const name of names) {
      const port = await getPrinterPortFromRegistry(name);
      if (!port) continue;
      if (await copyToPort(port, tmpFile)) {
        console.log(`[${logTag}] port copy ${port} → "${name}"`);
        return;
      }
    }

    throw new Error(
      lastError?.message ||
        `Could not print to "${printerName}". Run PrintServer/tools/build-rawprint.bat once as Admin, then restart the print server.`
    );
  } finally {
    setTimeout(() => fs.unlink(tmpFile, () => {}), 3000);
  }
}

module.exports = {
  sendRawLabelToPrinter,
  printerNameCandidates,
  getPrinterPortFromRegistry,
  ensureRawPrintExe,
};
