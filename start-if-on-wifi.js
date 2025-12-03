// start-if-on-wifi.js
// Usage: node start-if-on-wifi.js
// Reads EXPECTED_GATEWAY and EXPECTED_SSID from process.env (or .env via dotenv).
// If matched, will require('./server.js') to start the server and try to open the browser.

require('dotenv').config();
const { exec } = require('child_process');
const os = require('os');

const EXPECTED_GATEWAY = process.env.EXPECTED_GATEWAY || process.env.COMPANY_GATEWAY || '';
const EXPECTED_SSID = process.env.EXPECTED_SSID || '';

console.log('Detecting network status...');
console.log('Expected gateway:', EXPECTED_GATEWAY || '(not set)');
console.log('Expected SSID:', EXPECTED_SSID || '(not set)');

async function detectDefaultGateway() {
  const platform = process.platform;
  return new Promise(resolve => {
    if (platform === 'win32') {
      exec('route print -4', (err, stdout) => {
        if (err || !stdout) return resolve(null);
        try {
          const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          const routeLines = lines.filter(l => /^\d+\.\d+\.\d+\.\d+\s+\d+\.\d+\.\d+\.\d+\s+\d+\.\d+\.\d+\.\d+/.test(l));
          for (const l of routeLines) {
            const parts = l.split(/\s+/);
            if (parts[0] === '0.0.0.0' && parts[1] === '0.0.0.0') {
              return resolve(parts[2]);
            }
          }
          resolve(null);
        } catch (e) { resolve(null); }
      });
    } else {
      exec('ip route 2>/dev/null || route -n 2>/dev/null', (err, stdout) => {
        if (err || !stdout) {
          exec('netstat -rn 2>/dev/null', (e2, out2) => {
            if (e2 || !out2) return resolve(null);
            try {
              const m = out2.match(/default\s+via\s+([0-9.]+)/) || out2.match(/0.0.0.0\s+([0-9.]+\.[0-9.]+\.[0-9.]+\.[0-9.]+)/);
              return resolve(m ? m[1] : null);
            } catch (ex) { return resolve(null); }
          });
          return;
        }
        try {
          const m = stdout.match(/default via ([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/);
          if (m) return resolve(m[1]);
          const m2 = stdout.match(/0.0.0.0\s+([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/);
          if (m2) return resolve(m2[1]);
          resolve(null);
        } catch (e) { resolve(null); }
      });
    }
  });
}

async function detectSSIDWindows() {
  if (process.platform !== 'win32') return null;
  return new Promise(resolve => {
    exec('netsh wlan show interfaces', (err, stdout) => {
      if (err || !stdout) return resolve(null);
      const m = stdout.match(/^\s*SSID\s*:\s*(.+)$/m);
      if (m && m[1]) return resolve(m[1].trim());
      resolve(null);
    });
  });
}

function detectNetworkInterfaces() {
  const ifs = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(ifs)) {
    for (const info of ifs[name]) {
      if (info.family === 'IPv4' && !info.internal) {
        addresses.push({ name, address: info.address });
      }
    }
  }
  return addresses;
}

function inSame24(ipA, ipB) {
  if (!ipA || !ipB) return false;
  const a = ipA.split('.').slice(0, 3).join('.');
  const b = ipB.split('.').slice(0, 3).join('.');
  return a === b;
}

function openUrlInBrowser(url) {
  // Cross-platform "open" using child_process.exec
  const platform = process.platform;
  let cmd;
  if (platform === 'win32') {
    // start "" "url"  (the empty title prevents interpret issues)
    cmd = `start "" "${url}"`;
  } else if (platform === 'darwin') {
    cmd = `open "${url}"`;
  } else {
    // linux/unix
    cmd = `xdg-open "${url}"`;
  }

  exec(cmd, (err) => {
    if (err) {
      console.warn('Could not open browser automatically:', err.message || err);
    } else {
      console.log('Browser opened:', url);
    }
  });
}

async function startServer() {
  try {
    // require server; server.js should start listening when required
    require('./server.js');
    // give a short delay to let server start printing its logs before opening browser
    setTimeout(() => {
      const port = process.env.PORT || 3000;
      const host = process.env.HOST || 'localhost';
      const url = `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/login`;
      // Try to open browser (best-effort). If fails, do not crash.
      openUrlInBrowser(url);
      console.log(`Listening on ${host}:${port}`);
    }, 600);
  } catch (err) {
    console.error('Failed to start server:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

async function main() {
  try {
    const gatewayDetected = await detectDefaultGateway();
    const ssidDetected = await detectSSIDWindows();
    const nifs = detectNetworkInterfaces();

    console.log('Default gateway detection ->', gatewayDetected);
    if (ssidDetected) console.log('SSID detection ->', ssidDetected);
    console.log('networkInterfaces ->', nifs);

    let ok = false;

    if (EXPECTED_SSID && ssidDetected && ssidDetected.toLowerCase().includes(EXPECTED_SSID.toLowerCase())) {
      ok = true;
      console.log('Connected: SSID matches expected.');
    }

    if (!ok && EXPECTED_GATEWAY && gatewayDetected && gatewayDetected === EXPECTED_GATEWAY) {
      ok = true;
      console.log('Connected: default gateway matches expected.');
    }

    if (!ok && EXPECTED_GATEWAY) {
      for (const a of nifs) {
        if (inSame24(a.address, EXPECTED_GATEWAY)) {
          ok = true;
          console.log(`Connected: local address ${a.address} appears in same subnet as ${EXPECTED_GATEWAY}.`);
          break;
        }
      }
    }

    if (ok) {
      console.log('✅ Starting server (require ./server.js)...');
      await startServer();
      return;
    }

    console.log('Not connected to company network. Connect to the company Wi-Fi to start portal.');
    if (EXPECTED_GATEWAY || EXPECTED_SSID) {
      console.log('Expected gateway / SSID not detected.');
      if (EXPECTED_GATEWAY) console.log('Expected gateway:', EXPECTED_GATEWAY);
      if (EXPECTED_SSID) console.log('Expected SSID:', EXPECTED_SSID);
    } else {
      console.log('No EXPECTED_GATEWAY or EXPECTED_SSID configured. Set EXPECTED_GATEWAY in your .env');
    }
    process.exit(0);
  } catch (err) {
    console.error('Gateway detection error:', err);
    console.log('Not connected to company network. Connect to the company Wi-Fi to start portal.');
    process.exit(0);
  }
}

main();
