/**
 * MITM (Man-in-the-middle) management: install/uninstall CA cert, set/clear
 * system HTTP(S) proxy, and verify HTTPS interception.
 *
 * Supports three platforms:
 *   - Windows: certutil + netsh
 *   - macOS:   security + networksetup
 *   - Linux:   update-ca-certificates + gsettings/env
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import { getPlatform } from './platform';
import { ensureCa, readCa, getCaCertPath } from './cert';
import { probe } from './probe';

const execFileAsync = promisify(execFile);

export const DEFAULT_MITM_PORT = 50999;

export interface MitmStatus {
  caExists: boolean;
  caInstalled: boolean;
  caFingerprint: string | null;
  caCertPath: string | null;
  proxyEnabled: boolean;
  proxyHost: string | null;
  proxyPort: number | null;
  interceptionOk: boolean | null; // null = not tested
  interceptionError: string | null;
  platform: string;
  details: string[];
}

/** Full status report for `ag-doctor mitm status`. */
export async function getMitmStatus(port = DEFAULT_MITM_PORT): Promise<MitmStatus> {
  const platform = getPlatform();
  const ca = readCa();
  const details: string[] = [];

  let caInstalled = false;
  if (ca) {
    try {
      caInstalled = await isCaInstalled(ca.fingerprint);
      details.push(`CA fingerprint: ${ca.fingerprint}`);
    } catch (e) {
      details.push(`CA install check failed: ${(e as Error).message}`);
    }
  } else {
    details.push('CA not generated yet — run `ag-doctor mitm install`');
  }

  let proxyEnabled = false;
  let proxyHost: string | null = null;
  let proxyPort: number | null = null;
  try {
    const proxy = await getSystemProxy();
    proxyEnabled = proxy.enabled;
    proxyHost = proxy.host;
    proxyPort = proxy.port;
    if (proxyEnabled) {
      details.push(`System proxy: ${proxy.host}:${proxy.port}`);
    } else {
      details.push('System proxy not set');
    }
  } catch (e) {
    details.push(`Proxy check failed: ${(e as Error).message}`);
  }

  let interceptionOk: boolean | null = null;
  let interceptionError: string | null = null;
  if (caInstalled && proxyEnabled) {
    try {
      const r = await probe(`https://daily-cloudcode-pa.googleapis.com/v1internal:ping`, 5000, `http://${proxyHost}:${proxyPort}`);
      interceptionOk = r.ok;
      interceptionError = r.error ?? null;
      details.push(`Interception test: ${r.ok ? `OK (${r.latencyMs}ms)` : `FAILED — ${r.error}`}`);
    } catch (e) {
      interceptionOk = false;
      interceptionError = (e as Error).message;
    }
  }

  return {
    caExists: !!ca,
    caInstalled,
    caFingerprint: ca?.fingerprint ?? null,
    caCertPath: ca?.certPath ?? null,
    proxyEnabled,
    proxyHost,
    proxyPort,
    interceptionOk,
    interceptionError,
    platform,
    details,
  };
}

/** Install the CA cert into the OS trust store. */
export async function installCaCert(): Promise<{ ok: boolean; message: string }> {
  const ca = ensureCa();
  const platform = getPlatform();
  try {
    if (platform === 'win32') {
      await execFileAsync('certutil', ['-addstore', '-f', 'ROOT', ca.certPath], { windowsHide: true });
    } else if (platform === 'darwin') {
      await execFileAsync('sudo', [
        'security',
        'add-trusted-cert',
        '-d',
        '-r', 'trustRoot',
        '-k', '/Library/Keychains/System.keychain',
        ca.certPath,
      ]);
    } else {
      // Linux: copy to /usr/local/share/ca-certificates and update
      const dest = '/usr/local/share/ca-certificates/antigravity-mitm.crt';
      fs.copyFileSync(ca.certPath, dest);
      await execFileAsync('sudo', ['update-ca-certificates']);
    }
    return { ok: true, message: `CA installed (fingerprint: ${ca.fingerprint})` };
  } catch (e) {
    return { ok: false, message: `Failed to install CA: ${(e as Error).message}` };
  }
}

/** Remove the CA cert from the OS trust store. */
export async function uninstallCaCert(): Promise<{ ok: boolean; message: string }> {
  const ca = readCa();
  if (!ca) return { ok: true, message: 'No CA to remove' };
  const platform = getPlatform();
  try {
    if (platform === 'win32') {
      await execFileAsync('certutil', ['-delstore', 'ROOT', CA_NAME], { windowsHide: true });
    } else if (platform === 'darwin') {
      await execFileAsync('sudo', [
        'security',
        'delete-certificate',
        '-c', CA_NAME,
        '/Library/Keychains/System.keychain',
      ]);
    } else {
      const dest = '/usr/local/share/ca-certificates/antigravity-mitm.crt';
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      await execFileAsync('sudo', ['update-ca-certificates', '--fresh']);
    }
    return { ok: true, message: 'CA removed' };
  } catch (e) {
    return { ok: false, message: `Failed to remove CA: ${(e as Error).message}` };
  }
}

/** Set the system HTTP/HTTPS proxy to point at the local MITM proxy. */
export async function setSystemProxy(host = '127.0.0.1', port = DEFAULT_MITM_PORT): Promise<{ ok: boolean; message: string }> {
  const platform = getPlatform();
  try {
    if (platform === 'win32') {
      await execFileAsync('netsh', ['winhttp', 'set', 'proxy', `proxy-server="${host}:${port}"`], { windowsHide: true });
    } else if (platform === 'darwin') {
      // Detect active network service
      const { stdout } = await execFileAsync('networksetup', ['-listallnetworkservices']);
      const services = stdout.split('\n').filter((l) => l && !l.startsWith('An asterisk'));
      for (const svc of services) {
        await execFileAsync('networksetup', ['-setwebproxy', svc, host, String(port)]);
        await execFileAsync('networksetup', ['-setsecurewebproxy', svc, host, String(port)]);
        await execFileAsync('networksetup', ['-setwebproxystate', svc, 'on']);
        await execFileAsync('networksetup', ['-setsecurewebproxystate', svc, 'on']);
      }
    } else {
      // Linux: set gsettings for GNOME (best-effort)
      try {
        await execFileAsync('gsettings', ['set', 'org.gnome.system.proxy', 'mode', 'manual']);
        await execFileAsync('gsettings', ['set', 'org.gnome.system.proxy.http', 'host', host]);
        await execFileAsync('gsettings', ['set', 'org.gnome.system.proxy.http', 'port', String(port)]);
        await execFileAsync('gsettings', ['set', 'org.gnome.system.proxy.https', 'host', host]);
        await execFileAsync('gsettings', ['set', 'org.gnome.system.proxy.https', 'port', String(port)]);
      } catch {
        // No gsettings (headless / non-GNOME) — fall back to env vars only
        process.env.http_proxy = `http://${host}:${port}`;
        process.env.https_proxy = `http://${host}:${port}`;
      }
    }
    return { ok: true, message: `Proxy set to ${host}:${port}` };
  } catch (e) {
    return { ok: false, message: `Failed to set proxy: ${(e as Error).message}` };
  }
}

/** Clear the system HTTP/HTTPS proxy. */
export async function clearSystemProxy(): Promise<{ ok: boolean; message: string }> {
  const platform = getPlatform();
  try {
    if (platform === 'win32') {
      await execFileAsync('netsh', ['winhttp', 'reset', 'proxy'], { windowsHide: true });
    } else if (platform === 'darwin') {
      const { stdout } = await execFileAsync('networksetup', ['-listallnetworkservices']);
      const services = stdout.split('\n').filter((l) => l && !l.startsWith('An asterisk'));
      for (const svc of services) {
        await execFileAsync('networksetup', ['-setwebproxystate', svc, 'off']);
        await execFileAsync('networksetup', ['-setsecurewebproxystate', svc, 'off']);
      }
    } else {
      try {
        await execFileAsync('gsettings', ['set', 'org.gnome.system.proxy', 'mode', 'none']);
      } catch {
        delete process.env.http_proxy;
        delete process.env.https_proxy;
      }
    }
    return { ok: true, message: 'Proxy cleared' };
  } catch (e) {
    return { ok: false, message: `Failed to clear proxy: ${(e as Error).message}` };
  }
}

/** Read the current system proxy (best-effort, platform-specific). */
export async function getSystemProxy(): Promise<{ enabled: boolean; host: string | null; port: number | null }> {
  const platform = getPlatform();
  try {
    if (platform === 'win32') {
      const { stdout } = await execFileAsync('netsh', ['winhttp', 'show', 'proxy'], { windowsHide: true });
      const m = stdout.match(/Proxy Server\(s\)\s*:\s*([^\s]+)/);
      if (m && m[1] !== 'Direct access (no proxy server).') {
        const [host, portStr] = m[1].split(':');
        return { enabled: true, host, port: parseInt(portStr, 10) };
      }
      return { enabled: false, host: null, port: null };
    }
    if (platform === 'darwin') {
      const { stdout } = await execFileAsync('networksetup', ['-getwebproxy', 'Wi-Fi']);
      const host = stdout.match(/^Server:\s*(\S+)/m)?.[1] ?? null;
      const port = parseInt(stdout.match(/^Port:\s*(\d+)/m)?.[1] ?? '0', 10) || null;
      const enabled = stdout.includes('Enabled: Yes');
      return { enabled, host, port };
    }
    // Linux
    try {
      const { stdout } = await execFileAsync('gsettings', ['get', 'org.gnome.system.proxy', 'mode']);
      const enabled = stdout.trim() === "'manual'";
      if (!enabled) return { enabled: false, host: null, port: null };
      const { stdout: host } = await execFileAsync('gsettings', ['get', 'org.gnome.system.proxy.https', 'host']);
      const { stdout: port } = await execFileAsync('gsettings', ['get', 'org.gnome.system.proxy.https', 'port']);
      return {
        enabled: true,
        host: host.trim().replace(/^'|'$/g, ''),
        port: parseInt(port.trim(), 10) || null,
      };
    } catch {
      return { enabled: false, host: null, port: null };
    }
  } catch {
    return { enabled: false, host: null, port: null };
  }
}

/** Check if a CA with the given fingerprint is installed in the OS trust store. */
export async function isCaInstalled(fingerprint: string): Promise<boolean> {
  const platform = getPlatform();
  const caCertPath = getCaCertPath();
  try {
    if (platform === 'win32') {
      // certutil -verifystore ROOT <thumbprint> exits 0 if found
      const thumbprint = fingerprint.replace(/:/g, '').toLowerCase();
      await execFileAsync('certutil', ['-verifystore', 'ROOT', thumbprint], { windowsHide: true });
      return true;
    }
    if (platform === 'darwin') {
      const { stdout } = await execFileAsync('security', ['find-certificate', '-a', '-c', CA_NAME, '/Library/Keychains/System.keychain']);
      return stdout.includes(fingerprint.replace(/:/g, '').toUpperCase()) || stdout.length > 0;
    }
    // Linux
    const dest = '/usr/local/share/ca-certificates/antigravity-mitm.crt';
    return fs.existsSync(dest);
  } catch {
    return false;
  }
}
