# Pehnawa Print Server

Local receipt print server (port **3001**). Runs as a Windows service so it starts on boot.

## Client laptop setup

1. Install [Node.js](https://nodejs.org/)
2. Copy this folder to the laptop
3. Right-click **`SETUP-CLIENT-LAPTOP.bat`** → **Run as administrator**
4. Open [http://localhost:3001/health](http://localhost:3001/health)

## Manage later

| Action | File |
|--------|------|
| Start service | `start-service.bat` |
| Stop service | `stop-service.bat` |
| Uninstall service | `uninstall-service.bat` |
| Manual run (test) | `start-print-server.bat` |

Logo used on receipts: `Printserver-logo.png` (must stay in this folder).
