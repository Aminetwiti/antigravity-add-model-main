/**
 * Connectivity check — pings each configured provider endpoint.
 *
 * Semantics: "reachable" means the server responded with any HTTP status
 * (2xx/3xx/4xx/5xx). A 404 still means the host is up; the URL path may be
 * wrong, but the endpoint itself is alive. The full status code is surfaced
 * in the details so users can spot misconfigured paths.
 */
import type { CheckResult } from '../types';
import { loadCustomModels } from '../core/custom-models';
import { probe } from '../core/probe';

export async function checkConnectivity(): Promise<CheckResult> {
  const file = loadCustomModels();
  if (file.models.length === 0) {
    return {
      id: 'connectivity',
      title: 'Provider connectivity',
      status: 'info',
      message: 'No models configured, nothing to probe',
    };
  }
  const urls = Array.from(new Set(file.models.map((m) => m.apiUrl).filter(Boolean)));
  const results = await Promise.all(urls.map((u) => probe(u, 5000)));
  const reachable = results.filter((r) => r.ok).length;
  if (reachable === results.length) {
    const allOk = results.every((r) => r.statusCode && r.statusCode >= 200 && r.statusCode < 300);
    return {
      id: 'connectivity',
      title: 'Provider connectivity',
      status: allOk ? 'ok' : 'warn',
      message: allOk
        ? `All ${reachable}/${results.length} endpoints reachable`
        : `All ${reachable}/${results.length} endpoints reachable (some returned non-2xx)`,
      details: results.map((r) => `  ${r.ok ? '✔' : '✖'} ${r.url} — HTTP ${r.statusCode ?? '???'}`).join('\n'),
      data: { results },
    };
  }
  if (reachable === 0) {
    return {
      id: 'connectivity',
      title: 'Provider connectivity',
      status: 'error',
      message: `0/${results.length} endpoints reachable`,
      details: results.map((r) => `  ${r.ok ? '✔' : '✖'} ${r.url} — ${r.error ?? r.statusCode}`).join('\n'),
      data: { results },
    };
  }
  return {
    id: 'connectivity',
    title: 'Provider connectivity',
    status: 'warn',
    message: `${reachable}/${results.length} endpoints reachable`,
    details: results.map((r) => `  ${r.ok ? '✔' : '✖'} ${r.url} — ${r.error ?? r.statusCode}`).join('\n'),
    data: { results },
  };
}
