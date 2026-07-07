/**
 * Process management: find / kill / spawn Antigravity.
 */
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { getPlatform } from './platform';

const execFileAsync = promisify(execFile);

export interface ProcessInfo {
  pid: number;
  command: string;
}

/** Find running Antigravity processes. */
export async function findAntigravityProcesses(): Promise<ProcessInfo[]> {
  const platform = getPlatform();
  try {
    if (platform === 'win32') {
      const { stdout } = await execFileAsync('tasklist', ['/FI', 'IMAGENAME eq Antigravity.exe', '/FO', 'CSV', '/NH']);
      return parseWindowsTasklist(stdout);
    }
    if (platform === 'darwin' || platform === 'linux') {
      const { stdout } = await execFileAsync('pgrep', ['-af', 'Antigravity']);
      return parsePgrep(stdout);
    }
  } catch {
    // pgrep/tasklist exit 1 when nothing matches
  }
  return [];
}

function parseWindowsTasklist(stdout: string): ProcessInfo[] {
  const out: ProcessInfo[] = [];
  const lines = stdout.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^"Antigravity\.exe","(\d+)"/);
    if (m) out.push({ pid: parseInt(m[1], 10), command: 'Antigravity.exe' });
  }
  return out;
}

function parsePgrep(stdout: string): ProcessInfo[] {
  const out: ProcessInfo[] = [];
  const lines = stdout.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^(\d+)\s+(.*)$/);
    if (m) out.push({ pid: parseInt(m[1], 10), command: m[2] });
  }
  return out;
}

/** Kill all Antigravity processes. */
export async function killAntigravityProcesses(): Promise<{ killed: number }> {
  const procs = await findAntigravityProcesses();
  const platform = getPlatform();
  for (const p of procs) {
    try {
      process.kill(p.pid, platform === 'win32' ? undefined : 'SIGTERM');
    } catch {
      // ignore
    }
  }
  return { killed: procs.length };
}

/** Check if a TCP port is in use. */
export async function isPortInUse(port: number, host = '127.0.0.1'): Promise<boolean> {
  const net = await import('net');
  return new Promise((resolve) => {
    const sock = net.createConnection({ port, host });
    sock.once('connect', () => {
      sock.destroy();
      resolve(true);
    });
    sock.once('error', () => resolve(false));
  });
}

/** Spawn a child process, inheriting stdio. */
export function spawnInherit(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('exit', (code) => resolve(code ?? 0));
    child.on('error', reject);
  });
}
