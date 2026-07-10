/**
 * Emergency HTTP stub proxy.
 *
 * Listens on 127.0.0.1:50999 (or custom port) and returns a minimal valid
 * response for any request. Used as a fallback when the real bundled proxy
 * crashes silently (see update.md P4).
 *
 * Features:
 *   - /health → 200 {"status":"ok","stub":true,"port":50999}
 *   - All other routes → 200 {} with X-Proxy-Stub: 1 header
 *   - Logs to %TEMP%/ag-stub-proxy.log (Windows) or /tmp/ag-stub-proxy.log
 *   - Zero external dependencies (uses Node http module)
 *   - Graceful shutdown on SIGINT/SIGTERM
 *
 * Usage:
 *   node stub-proxy.js [port]
 *   node stub-proxy.js 50999
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = parseInt(process.argv[2] || process.env.AG_STUB_PORT || '50999', 10);
const HOST = '127.0.0.1';

// Force IPv4 to avoid [::1] vs 127.0.0.1 mismatch (fix #21)
require('dns').setDefaultResultOrder('ipv4first');

// Log file location
const LOG_DIR = process.platform === 'win32'
  ? path.join(os.tmpdir(), 'ag-doctor')
  : '/tmp';
const LOG_FILE = path.join(LOG_DIR, 'ag-stub-proxy.log');

function log(level, msg) {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line);
  } catch { /* ignore */ }
  // Also write to stderr (captured by parent)
  process.stderr.write(line);
}

const server = http.createServer((req, res) => {
  const start = Date.now();
  log('REQ', `${req.method} ${req.url} from ${req.socket.remoteAddress}`);

  // Health check endpoint
  if (req.url === '/health') {
    const body = JSON.stringify({
      status: 'ok',
      stub: true,
      port: PORT,
      uptime: process.uptime(),
      pid: process.pid,
    });
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'X-Proxy-Stub': '1',
      'Cache-Control': 'no-store',
    });
    res.end(body);
    log('RES', `200 /health (${Date.now() - start}ms)`);
    return;
  }

  // Drain request body to free the socket
  req.resume();

  // All other routes: return empty JSON object with stub marker
  // This makes language_server stop erroring about ECONNREFUSED
  const body = '{}';
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'X-Proxy-Stub': '1',
    'Cache-Control': 'no-store',
  });
  res.end(body);
  log('RES', `200 ${req.url} (${Date.now() - start}ms)`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    log('FATAL', `Port ${PORT} already in use — another instance is running`);
    process.exit(2);
  }
  log('FATAL', `Server error: ${err.message}`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  log('INFO', `Stub proxy listening on http://${HOST}:${PORT} (pid=${process.pid})`);
  log('INFO', `Log file: ${LOG_FILE}`);
});

// Graceful shutdown
function shutdown(signal) {
  log('INFO', `Received ${signal}, shutting down...`);
  server.close(() => {
    log('INFO', 'Server closed');
    process.exit(0);
  });
  // Force exit after 3s if close hangs
  setTimeout(() => {
    log('WARN', 'Forced exit after 3s');
    process.exit(0);
  }, 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  log('ERROR', `Uncaught: ${err.message}\n${err.stack}`);
});
process.on('unhandledRejection', (reason) => {
  log('ERROR', `Unhandled rejection: ${reason}`);
});
