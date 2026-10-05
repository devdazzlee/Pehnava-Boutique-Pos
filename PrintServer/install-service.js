/**
 * Windows Service Installer for Manpasand POS Print Server
 * 
 * This script installs the print server as a Windows service that:
 * - Starts automatically when Windows boots
 * - Automatically restarts if it crashes or closes
 * - Runs in the background without user interaction
 * 
 * Run: node install-service.js
 * Uninstall: node uninstall-service.js
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

const SERVICE_NAMES = ['manpasandprintserver.exe', 'Manpasand Print Server'];

function findServiceName() {
  for (const name of SERVICE_NAMES) {
    try {
      execSync(`sc query "${name}"`, { stdio: 'pipe', windowsHide: true });
      return name;
    } catch (_) {}
  }
  return null;
}

function runScConfigAuto() {
  const name = findServiceName();
  if (!name) throw new Error('sc config: service not found');
  // Correct syntax: sc config "NAME" start= auto
  execSync(`sc config "${name}" start= auto`, { stdio: 'pipe', windowsHide: true });
  return name;
}

function runScStart() {
  const name = findServiceName();
  if (!name) throw new Error('sc start: service not found');
  execSync(`sc start "${name}"`, { stdio: 'pipe', windowsHide: true });
  return name;
}

function preflight() {
  const scriptPath = path.resolve(__dirname, 'server.js');
  const errors = [];

  if (!fs.existsSync(scriptPath)) {
    errors.push('server.js not found');
  }

  const requiredModules = ['express', 'pdfkit', 'pdf-to-printer', 'bwip-js', 'cors'];
  for (const mod of requiredModules) {
    try {
      require.resolve(mod, { paths: [__dirname] });
    } catch (_) {
      errors.push(`Missing module: ${mod} (run: npm install)`);
    }
  }

  if (errors.length) {
    console.error('');
    console.error('Preflight failed:');
    errors.forEach((e) => console.error(`  - ${e}`));
    console.error('');
    process.exit(1);
  }

  return scriptPath;
}

// Check if node-windows is installed
let Service;
try {
  Service = require('node-windows').Service;
} catch (error) {
  console.error('');
  console.error('❌ ERROR: node-windows module not found!');
  console.error('');
  console.error('Please install it first:');
  console.error('  npm install node-windows --save');
  console.error('');
  console.error('Or use the batch file which installs it automatically:');
  console.error('  install-service.bat');
  console.error('');
  process.exit(1);
}

// Get the directory where this script is located
const scriptPath = preflight();
const nodeExe = process.execPath;

if (!fs.existsSync(nodeExe)) {
  console.error(`❌ Node executable not found: ${nodeExe}`);
  process.exit(1);
}

console.log('📁 PrintServer folder: ' + __dirname);
console.log('📁 server.js: ' + scriptPath);
console.log('📁 node.exe: ' + nodeExe);
console.log('');

// Create a new service object
const svc = new Service({
  name: 'Manpasand Print Server',
  description: 'Local print server for Pehnawa Boutique Pos receipt printing',
  script: scriptPath,
  execPath: nodeExe,
  workingDirectory: __dirname,
  nodeOptions: [
    '--max_old_space_size=4096'
  ],
  env: [
    {
      name: "NODE_ENV",
      value: "production"
    }
  ],
  // Set to start automatically on Windows boot - no user interaction required
  grow: 0.5,
  wait: 2,
  maxRestarts: 5
});

function verifyDaemonXml() {
  const xmlPath = path.join(__dirname, 'daemon', 'manpasandprintserver.xml');
  if (!fs.existsSync(xmlPath)) return;

  const xml = fs.readFileSync(xmlPath, 'utf8');
  const paths = [
    ...xml.matchAll(/<executable>([^<]+)<\/executable>/g),
    ...xml.matchAll(/<workingdirectory>([^<]+)<\/workingdirectory>/g),
    ...[...xml.matchAll(/<argument>([^<]+)<\/argument>/g)]
      .map((m) => m[1].trim())
      .filter((p) => /[\\/]/.test(p) && /\.(js|exe|node)$/i.test(p))
  ].map((m) => (typeof m === 'string' ? m : m[1].trim()));

  const missing = paths.filter((p) => {
    if (!p || p === 'undefined' || p.startsWith('--')) return false;
    return !fs.existsSync(p);
  });

  if (missing.length) {
    console.log('⚠️  Service XML references missing files:');
    missing.forEach((p) => console.log('   - ' + p));
  } else {
    console.log('✅ All service paths verified');
  }
}

// Listen for the "install" event, which indicates the process is available as a service
svc.on('install', function() {
  console.log('✅ Print Server service installed successfully!');
  console.log('📁 Registered path: ' + scriptPath);
  verifyDaemonXml();

  setTimeout(() => {
    try {
      console.log('🔧 Setting startup type to AUTOMATIC...');
      const serviceName = runScConfigAuto();
      console.log('✅ Startup type confirmed: AUTOMATIC (' + serviceName + ')');

      try {
        execSync(
          `sc failure "${serviceName}" reset= 86400 actions= restart/60000/restart/60000/restart/60000`,
          { stdio: 'ignore', windowsHide: true }
        );
        console.log('✅ Recovery options configured (auto-restart on failure)');
      } catch (recoveryError) {
        console.log('⚠️  Could not configure recovery options (non-critical)');
      }

      console.log('🚀 Starting service...');
      try {
        runScStart();
      } catch (startErr) {
        console.log('⚠️  sc start: ' + startErr.message);
      }

      setTimeout(() => {
        try {
          let running = false;
          for (const name of SERVICE_NAMES) {
            try {
              const statusOutput = execSync(`sc query "${name}"`, {
                encoding: 'utf8',
                windowsHide: true
              });
              if (statusOutput.includes('RUNNING')) {
                running = true;
                break;
              }
            } catch (_) {}
          }
          if (running) {
            console.log('✅ Service started successfully and is RUNNING!');
            if (process.env.SETUP_CLIENT === '1') process.exit(0);
          } else {
            console.log('⚠️  Service may still be starting...');
            // Exit 0 so setup-client.js can finish start itself
            if (process.env.SETUP_CLIENT === '1') process.exit(0);
          }
        } catch (statusError) {
          console.log('⚠️  Could not verify service status');
          if (process.env.SETUP_CLIENT === '1') process.exit(0);
        }
      }, 5000);
      
    } catch (error) {
      console.log('⚠️  Could not set startup type automatically');
      console.log('   Error: ' + error.message);
      console.log('   Run manually: sc config "manpasandprintserver.exe" start= auto');
      console.log('                 sc start "manpasandprintserver.exe"');
      if (process.env.SETUP_CLIENT === '1') process.exit(0);
    }
  }, 3000);
  
  console.log('');
  console.log('📋 Service will start automatically on Windows boot');
  console.log('🔄 Service will auto-restart if it crashes or closes');
  console.log('');
  console.log('Test it: http://localhost:3001/health');
  console.log('');
  console.log('To uninstall the service, run:');
  console.log('  node uninstall-service.js');
});

// Listen for the "alreadyinstalled" event
svc.on('alreadyinstalled', function() {
  console.log('⚠️  Service already installed with OLD paths (this causes the error in Event Viewer).');
  console.log('');
  console.log('Run as Administrator:');
  console.log('  fix-service.bat');
  console.log('');
  console.log('Or manually:');
  console.log('  node uninstall-service.js');
  console.log('  node install-service.js');
  process.exit(1);
});

// Listen for errors during installation
svc.on('error', function(err) {
  console.error('❌ Error installing service:', err);
  console.error('');
  console.error('Common issues:');
  console.error('1. Run this script as Administrator');
  console.error('2. Make sure node-windows is installed: npm install node-windows --save');
  console.error('3. Check if the service is already installed');
  if (process.env.SETUP_CLIENT === '1') process.exit(1);
});

// Install the service
console.log('🔧 Installing Manpasand Print Server as Windows service...');
console.log('📁 Service path: ' + scriptPath);
console.log('');

function isElevated() {
  try {
    execSync('net session', { stdio: 'ignore', windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

if (!isElevated()) {
  console.log('⚠️  WARNING: Not elevated. Right-click SETUP-CLIENT-LAPTOP.bat → Run as administrator');
  console.log('');
}
svc.install();

