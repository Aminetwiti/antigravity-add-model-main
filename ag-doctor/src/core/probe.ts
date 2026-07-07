/**
 * Connectivity probe — pings an endpoint and reports latency / status.
 * Uses Node's built-in http/https modules, no third-party deps.
 */
import http from 'http';
import https from 'https';
import { URL } from 'url';
import type { ConnectivityResult } from '../types';

export async function probe(url: string, timeoutMs = 5000): Promise<ConnectivityResult> {
  const started = Date.now();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (e) {
    return { url, ok: false, error: `invalid URL: ${(e as Error).message}` };
  }
  return new Promise((resolve) => {
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        method: 'GET',
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        timeout: timeoutMs,
        headers: { 'User-Agent': 'ag-doctor/1.0' },
      },
      (res) => {
        res.resume();
        resolve({
          url,
          ok: true,
          latencyMs: Date.now() - started,
          statusCode: res.statusCode,
        });
      },
    );
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', (err) => {
      resolve({ url, ok: false, latencyMs: Date.now() - started, error: err.message });
    });
    req.end();
  });
}
