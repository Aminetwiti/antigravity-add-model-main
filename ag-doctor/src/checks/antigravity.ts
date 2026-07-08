/**
 * Doctor check: Antigravity install + version + running state.
 */
import type { CheckResult } from '../types';
import { getAntigravityStatus } from '../core/antigravity';

export async function checkAntigravity(): Promise<CheckResult> {
  const status = await getAntigravityStatus();
  if (!status.installed) {
    return {
      id: 'antigravity.install',
      title: 'Antigravity installation',
      status: 'error',
      message: 'Antigravity executable not found in standard locations',
      fixable: false,
    };
  }

  const v = status.versionInfo?.version ?? status.version ?? 'unknown';
  const running = status.running ? 'running' : 'not running';
  const proxy = status.proxyReachable ? 'reachable' : 'unreachable';
  const parts = [`v${v}`, running, `proxy ${proxy}`];
  const overall: 'ok' | 'warn' | 'error' = !status.running
    ? 'warn'
    : !status.proxyReachable
    ? 'warn'
    : 'ok';

  return {
    id: 'antigravity',
    title: 'Antigravity installation',
    status: overall,
    message: `${parts.join(' · ')}`,
    data: status,
  };
}
