/**
 * One-time Print Server setup for client laptops (no PowerShell).
 * Run as Administrator: SETUP-CLIENT-LAPTOP.bat
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync, spawn, spawnSync } = require('child_process');

const ROOT = __dirname;
// node-windows registers the service id as manpasandprintserver.exe
const SERVICE_NAMES = ['manpasandprintserver.exe', 'Manpasand Print Server'];
const HEALTH_URL = 'http://127.0.0.1:3001/health';

function log(msg) {
  console.log(msg);
}

function sleep(ms) {
  const pings = Math.max(2, Math.ceil(ms / 1000) + 1);
  execSync(`ping 127.0.0.1 -n ${pings} >nul`, { stdio: 'ignore', windowsHide: true });
}

function isAdmin() {
  try {
    execSync('net session', { stdio: 'ignore', windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: 'inherit', windowsHide: true, cwd: ROOT, ...opts });
}

function scOk(cmd) {
  try {
    execSync(cmd, { stdio: 'pipe', windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

function findInstalledServiceName() {
  for (const name of SERVICE_NAMES) {
    if (scOk(`sc query "${name}"`)) return name;
  }
  return null;
}

function buildRawPrintHelper() {
  log('\n[build] rawprint.exe (barcode labels, no PowerShell)...');
  const bat = path.join(ROOT, 'tools', 'build-rawprint.bat');
  if (!fs.existsSync(bat)) {
    log('  [WARN] tools/build-rawprint.bat missing — label print may fail until built');
    return;
  }
  try {
    execSync(`cmd /c "${bat}"`, { stdio: 'inherit', windowsHide: true, cwd: path.dirname(bat) });
    const exe = path.join(ROOT, 'daemon', 'rawprint.exe');
    if (fs.existsSync(exe)) log('[OK] daemon/rawprint.exe\n');
    else log('[WARN] rawprint.exe not built (.NET Framework 4.x required)\n');
  } catch (e) {
    log(`  [WARN] rawprint build: ${e.message}\n`);
  }
}

function killLockedServiceFiles() {
  // Free daemon\manpasandprintserver.exe (EPERM during uninstall)
  for (const image of ['manpasandprintserver.exe', 'ManpasandPrintServer.exe']) {
    try {
      execSync(`taskkill /F /IM ${image}`, { stdio: 'ignore', windowsHide: true });
    } catch (_) {}
  }
  // Free port 3001 from leftover manual tests
  try {
    const out = execSync('netstat -ano | findstr :3001', { encoding: 'utf8', windowsHide: true });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes('LISTENING')) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid)) pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore', windowsHide: true });
      } catch (_) {}
    }
  } catch (_) {}
  sleep(2000);
}

function stopAndDeleteServices() {
  log('\n[STEP 3] Remove old Windows service (if any)...');
  killLockedServiceFiles();

  for (const name of SERVICE_NAMES) {
    if (!scOk(`sc query "${name}"`)) continue;
    log(`  Stopping ${name}...`);
    scOk(`sc stop "${name}"`);
    sleep(3000);
  }

  killLockedServiceFiles();

  if (fs.existsSync(path.join(ROOT, 'uninstall-service.js'))) {
    log('  Uninstalling via node-windows...');
    spawnSync('node', ['uninstall-service.js'], {
      cwd: ROOT,
      stdio: 'inherit',
      timeout: 90000,
      windowsHide: true,
    });
    sleep(3000);
  }

  for (const name of SERVICE_NAMES) {
    scOk(`sc delete "${name}"`);
  }
  sleep(2000);
  killLockedServiceFiles();

  const daemonDir = path.join(ROOT, 'daemon');
  if (fs.existsSync(daemonDir)) {
    for (const f of fs.readdirSync(daemonDir)) {
      if (f === 'rawprint.exe') continue;
      try {
        fs.unlinkSync(path.join(daemonDir, f));
      } catch (e) {
        log(`  [WARN] Could not delete daemon\\${f}: ${e.message}`);
      }
    }
  }
  log('[OK] Old service cleaned\n');
}

function healthCheckOnce() {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(4000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore', windowsHide: true });
  } catch (_) {}
}

function readDaemonTail() {
  const daemonDir = path.join(ROOT, 'daemon');
  if (!fs.existsSync(daemonDir)) return;
  for (const f of fs.readdirSync(daemonDir).filter((x) => x.endsWith('.log') || x.endsWith('.out.log') || x.endsWith('.err.log'))) {
    console.error(`--- ${f} (last lines) ---`);
    try {
      const lines = fs.readFileSync(path.join(daemonDir, f), 'utf8').split('\n').slice(-20);
      console.error(lines.join('\n'));
    } catch (_) {}
  }
}

async function testServerOnce() {
  log('[STEP 2] Testing server.js (manual start)...');
  log('(First start can take 15–30 seconds — please wait)');

  if (await healthCheckOnce()) {
    log('[OK] Print server already responding on port 3001\n');
    return;
  }

  const outChunks = [];
  const errChunks = [];
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: { ...process.env, NODE_ENV: 'production' },
  });

  child.stdout.on('data', (d) => outChunks.push(d));
  child.stderr.on('data', (d) => errChunks.push(d));

  let exitedEarly = null;
  child.on('exit', (code, signal) => {
    exitedEarly = { code, signal };
  });

  for (let i = 0; i < 90; i++) {
    if (exitedEarly && exitedEarly.code !== 0 && exitedEarly.code !== null) {
      killProcessTree(child.pid);
      const out = Buffer.concat(outChunks).toString('utf8').trim();
      const err = Buffer.concat(errChunks).toString('utf8').trim();
      if (out) console.error('\nserver stdout:\n' + out);
      if (err) console.error('\nserver stderr:\n' + err);
      throw new Error(`server.js exited with code ${exitedEarly.code}`);
    }
    if (await healthCheckOnce()) {
      log('[OK] Server responds on /health\n');
      killProcessTree(child.pid);
      sleep(2000);
      return;
    }
    if (i > 0 && i % 10 === 0) log(`  ... still waiting (${i}s)`);
    sleep(1000);
  }

  killProcessTree(child.pid);
  throw new Error('Server did not respond on /health in time. Try: node server.js');
}

function installService() {
  log('[STEP 4] Installing Windows service...');
  log(`  Folder: ${ROOT}`);
  log(`  Node:   ${process.execPath}\n`);

  // Do not treat a non-zero exit as fatal if the service ends up installed —
  // install-service.js sometimes exits 1 when auto-start fails, even after install.
  spawnSync('node', ['install-service.js'], {
    cwd: ROOT,
    stdio: 'inherit',
    timeout: 180000,
    windowsHide: true,
    env: { ...process.env, SETUP_CLIENT: '1' },
  });

  sleep(4000);
  const name = findInstalledServiceName();
  if (!name) {
    throw new Error('Service was not registered. Re-run as Administrator.');
  }
  log(`[OK] Service registered as: ${name}\n`);
  return name;
}

function configureAndStart(name) {
  log('[STEP 5] Set AUTOMATIC + start service...');
  // Correct sc syntax: sc config "NAME" start= auto
  if (!scOk(`sc config "${name}" start= auto`)) {
    log('[WARN] Could not set start= auto (continuing)');
  } else {
    log('[OK] Startup type: Automatic');
  }

  try {
    execSync(
      `sc failure "${name}" reset= 86400 actions= restart/60000/restart/60000/restart/60000`,
      { stdio: 'ignore', windowsHide: true }
    );
  } catch (_) {}

  scOk(`sc start "${name}"`);
  log('  Start command sent, waiting...');
}

function waitForServiceRunning(maxSec = 45) {
  for (let i = 0; i < maxSec; i++) {
    for (const name of SERVICE_NAMES) {
      try {
        const out = execSync(`sc query "${name}"`, { encoding: 'utf8', windowsHide: true });
        if (out.includes('RUNNING')) return name;
      } catch (_) {}
    }
    if (i > 0 && i % 10 === 0) log(`  ... waiting for RUNNING (${i}s)`);
    sleep(1000);
  }
  return null;
}

async function main() {
  console.log('============================================');
  console.log('Pehnawa Print Server — Client Setup');
  console.log('============================================\n');

  if (!isAdmin()) {
    console.error('[ERROR] Run as Administrator.');
    console.error('Right-click SETUP-CLIENT-LAPTOP.bat → Run as administrator\n');
    process.exit(1);
  }

  log(`Folder: ${ROOT}\n`);

  log('[STEP 1] npm install...');
  run('npm install');
  log('[OK]\n');
  buildRawPrintHelper();

  for (const mod of ['express', 'pdfkit', 'pdf-to-printer', 'bwip-js', 'cors', 'node-windows', 'koffi']) {
    require.resolve(mod, { paths: [ROOT] });
  }

  await testServerOnce();
  // Free port 3001 before Windows service binds it
  killLockedServiceFiles();

  stopAndDeleteServices();
  buildRawPrintHelper();
  const serviceName = installService();
  configureAndStart(serviceName);

  log('[STEP 6] Waiting for service RUNNING...');
  const runningName = waitForServiceRunning(60);
  if (!runningName) {
    console.error('\n[ERROR] Service is not RUNNING.');
    try {
      console.error(execSync(`sc query "${serviceName}"`, { encoding: 'utf8', windowsHide: true }));
    } catch (_) {}
    readDaemonTail();
    console.error('\nTry manually:');
    console.error(`  sc start "${serviceName}"`);
    console.error('  then open http://localhost:3001/health');
    process.exit(1);
  }

  log(`[OK] Service "${runningName}" is RUNNING\n`);

  // Give node time to boot inside the service
  sleep(5000);
  let ok = false;
  for (let i = 0; i < 20; i++) {
    if (await healthCheckOnce()) {
      ok = true;
      break;
    }
    sleep(1000);
  }

  if (ok) {
    log('[SUCCESS] http://localhost:3001/health is OK');
  } else {
    log('[WARNING] Service running but /health not ready yet — wait ~10s and open:');
    log('  http://localhost:3001/health');
  }

  console.log('\nDone. Service starts automatically when Windows boots.');
  console.log(`Service name in services.msc: Manpasand Print Server`);
  console.log(`Service id: ${runningName}`);
  console.log('Test: http://localhost:3001/health\n');
}

main().catch((err) => {
  console.error('\n[ERROR]', err.message || err);
  process.exit(1);
});
