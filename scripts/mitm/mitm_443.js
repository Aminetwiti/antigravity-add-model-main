/**
 * MITM HTTPS forwarder on port 443.
 *
 * Dual-mode server:
 *   - TLS connections (Antigravity's patched binary): terminates TLS using
 *     the user-trusted CA, then forwards the decrypted HTTP request to the
 *     local Antigravity proxy on localhost:50999.
 *   - Plain HTTP CONNECT requests (ag-doctor interception test): tunnels
 *     raw bytes between the client and the requested host:port. This lets
 *     ag-doctor's `probeWithProxy` succeed without changing the test code.
 *
 * Requires:
 *   - CA cert trusted in Windows (LocalMachine\Root)
 *   - Run with admin rights so Node can bind port 443
 *
 * Usage (PowerShell admin):
 *   node C:\Users\amine\Downloads\antigravity-add-model-main\antigravity-add-model-main\scripts\mitm\mitm_443.js
 */

const https = require('https');
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');

const CERT_DIR = path.resolve(__dirname, '..', '..');
const PROXY_TARGET = process.env.AG_PROXY_TARGET || 'http://127.0.0.1:50999';
const LISTEN_HOST = process.env.AG_MITM_HOST || '127.0.0.1';
const LISTEN_PORT = parseInt(process.env.AG_MITM_PORT || '443', 10);

const serverKey = fs.readFileSync(path.join(CERT_DIR, 'certs', 'server-key.pem'));
const serverCert = fs.readFileSync(path.join(CERT_DIR, 'certs', 'server-cert.pem'));

const target = new URL(PROXY_TARGET);

/**
 * Forward a decrypted HTTP request to the local Antigravity proxy.
 * Used by the HTTPS server after TLS termination.
 */
function forwardToProxy(clientReq, clientRes) {
  const fwdOptions = {
    hostname: target.hostname,
    port: target.port,
    path: clientReq.url,
    method: clientReq.method,
    headers: { ...clientReq.headers },
  };

  // Preserve the original Google host so the proxy knows which upstream to use.
  fwdOptions.headers['host'] = clientReq.headers.host || target.host;
  fwdOptions.headers['x-forwarded-proto'] = 'https';

  const proxyReq = http.request(fwdOptions, (proxyRes) => {
    clientRes.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
    proxyRes.pipe(clientRes);
  });

  proxyReq.on('error', (err) => {
    console.error('[MITM-443] Forward error:', err.message);
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { 'Content-Type': 'application/json' });
      clientRes.end(JSON.stringify({ error: 'MITM forward failed: ' + err.message }));
    }
  });

  clientReq.pipe(proxyReq);
}

/**
 * Handle an HTTP CONNECT request by tunneling raw bytes to the target host:port.
 * This is what HTTP proxies do for HTTPS — they don't decrypt, they just relay.
 */
function handleConnect(clientSocket, host, port) {
  console.log(`[MITM-443] CONNECT ${host}:${port}`);

  const upstream = net.connect(parseInt(port, 10) || 443, host, () => {
    // Tell the client the tunnel is established
    clientSocket.write('HTTP/1.1 200 Connection Established\r\nProxy-Agent: Antigravity-MITM-443\r\n\r\n');
    // Relay bytes in both directions
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });

  // Timeout: if the upstream connection doesn't establish within 5s, fail fast
  // instead of hanging the client (ag-doctor) forever.
  upstream.setTimeout(5000);
  upstream.on('timeout', () => {
    console.error(`[MITM-443] CONNECT upstream timeout (${host}:${port})`);
    if (!clientSocket.destroyed) {
      clientSocket.write('HTTP/1.1 504 Gateway Timeout\r\nContent-Length: 0\r\n\r\n');
      clientSocket.destroy();
    }
    if (!upstream.destroyed) upstream.destroy();
  });

  upstream.on('error', (err) => {
    console.error(`[MITM-443] CONNECT upstream error (${host}:${port}):`, err.message);
    if (!clientSocket.destroyed) {
      clientSocket.write(`HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n`);
      clientSocket.destroy();
    }
  });

  clientSocket.on('error', (err) => {
    console.error(`[MITM-443] CONNECT client error (${host}:${port}):`, err.message);
    if (!upstream.destroyed) upstream.destroy();
  });

  upstream.on('close', () => {
    if (!clientSocket.destroyed) clientSocket.destroy();
  });
  clientSocket.on('close', () => {
    if (!upstream.destroyed) upstream.destroy();
  });
}

/**
 * Detect whether the first byte of a connection looks like a TLS ClientHello.
 * TLS handshake records start with 0x16 (Handshake) followed by 0x03 0x0X.
 */
function looksLikeTls(buf) {
  return (
    buf.length >= 3 &&
    buf[0] === 0x16 && // Handshake
    buf[1] === 0x03 &&
    buf[2] >= 0x01 && buf[2] <= 0x04
  );
}

/**
 * TCP-level dispatcher: buffer bytes until we can identify the protocol.
 * - TLS ClientHello starts with 0x16 0x03 0x0X (detected from the first 3 bytes).
 * - HTTP request lines end with \r\n (or just \n for malformed clients).
 */
const tcpServer = net.createServer((socket) => {
  let buf = Buffer.alloc(0);
  let dispatched = false;

  const dispatch = () => {
    if (dispatched) return;
    dispatched = true;
    socket.removeListener('data', onData);
    socket.removeListener('error', onError);
    socket.removeListener('close', onClose);
    socket.pause();

    // Peek the first 3 bytes to decide TLS vs HTTP.
    if (looksLikeTls(buf)) {
      console.log('[MITM-443] Detected TLS, terminating');
      httpsServer.emit('connection', socket);
      // Replay the buffered bytes so the TLS server can read them
      socket.unshift(buf);
      socket.resume();
      return;
    }

    // Parse the HTTP request line from the buffer.
    const head = buf.toString('ascii');
    const reqLine = head.split('\r\n')[0] || head.split('\n')[0] || '';
    const parts = reqLine.split(' ');
    const method = parts[0];
    const targetStr = parts[1] || '';

    if (method === 'CONNECT') {
      // target is "host:port"
      const [host, port] = targetStr.split(':');
      handleConnect(socket, host || '127.0.0.1', port || '443');
    } else if (/^(GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH)\s/.test(reqLine)) {
      // Non-CONNECT HTTP request — respond with 400 (we only support CONNECT)
      socket.write('HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n');
      socket.destroy();
    } else {
      console.error('[MITM-443] Unknown protocol, closing connection');
      socket.destroy();
    }
  };

  const onData = (chunk) => {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    // If the first 3 bytes look like TLS, we can dispatch immediately.
    if (looksLikeTls(buf)) {
      dispatch();
      return;
    }
    // Otherwise wait for the end of the HTTP request line.
    if (buf.includes(0x0a)) { // \n
      dispatch();
      return;
    }
    // Safety: don't buffer more than 8 KB without deciding.
    if (buf.length > 8192) {
      console.error('[MITM-443] Sniffer buffer overflow, closing');
      socket.destroy();
    }
  };

  const onError = (err) => {
    console.error('[MITM-443] Socket error during sniff:', err.message);
  };

  const onClose = () => {
    // Client disconnected before sending enough data.
  };

  socket.on('data', onData);
  socket.on('error', onError);
  socket.on('close', onClose);
});

const httpsServer = https.createServer({ key: serverKey, cert: serverCert }, forwardToProxy);

httpsServer.on('error', (err) => {
  console.error('[MITM-443] HTTPS server error:', err.message);
  if (err.code === 'EACCES') {
    console.error('[MITM-443] Permission denied. Run as Administrator to bind port 443.');
  }
  process.exit(1);
});

tcpServer.on('error', (err) => {
  console.error('[MITM-443] TCP server error:', err.message);
  if (err.code === 'EACCES') {
    console.error('[MITM-443] Permission denied. Run as Administrator to bind port 443.');
  }
  process.exit(1);
});

tcpServer.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(`[MITM-443] Listening on ${LISTEN_HOST}:${LISTEN_PORT} (dual-mode: TLS + HTTP CONNECT)`);
  console.log(`[MITM-443] Forwarding to ${PROXY_TARGET}`);
});
