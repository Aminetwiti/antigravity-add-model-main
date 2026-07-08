/**
 * Binary patch for the Antigravity language_server.
 *
 * Replaces the hardcoded URL `https://daily-cloudcode-pa.googleapis.com`
 * (41 bytes) with `http://localhost:50999/v1internal/xxxxxxx` (41 bytes)
 * so that all Cloud Code calls are routed through the local proxy.
 *
 * A backup of the original binary is automatically created at <binary>.bak
 * before any modification.
 */
import fs from 'fs';
import { getLanguageServerBinary, getLanguageServerBackup } from './paths';
import type { PatchStatus } from '../types';

export const ORIGINAL_URL = 'https://daily-cloudcode-pa.googleapis.com';
export const PATCHED_URL = 'http://localhost:50999/v1internal/xxxxxxx';

if (ORIGINAL_URL.length !== PATCHED_URL.length) {
  throw new Error(
    `Internal error: ORIGINAL_URL (${ORIGINAL_URL.length}) and PATCHED_URL (${PATCHED_URL.length}) must be the same length`,
  );
}

/** Returns the current patch status of the language server binary. */
export function getPatchStatus(installDir?: string): PatchStatus {
  const binaryPath = getLanguageServerBinary(installDir);
  const backupPath = getLanguageServerBackup(installDir);
  if (!binaryPath) {
    return {
      binaryPath: null,
      exists: false,
      applied: false,
      backupExists: false,
    };
  }
  const exists = fs.existsSync(binaryPath);
  const backupExists = backupPath ? fs.existsSync(backupPath) : false;
  if (!exists) {
    return { binaryPath, exists: false, applied: false, backupExists };
  }
  const buf = fs.readFileSync(binaryPath);
  const haystack = buf.toString('binary');
  const applied = haystack.includes(PATCHED_URL);
  return {
    binaryPath,
    exists: true,
    applied,
    backupExists,
    originalUrl: ORIGINAL_URL,
    patchedUrl: PATCHED_URL,
  };
}

/**
 * Apply the binary patch. Creates a backup first if it doesn't exist.
 * Returns true if the binary was modified, false if already patched.
 */
export function applyPatch(installDir?: string): { ok: boolean; message: string } {
  const binaryPath = getLanguageServerBinary(installDir);
  if (!binaryPath || !fs.existsSync(binaryPath)) {
    return { ok: false, message: 'Language server binary not found' };
  }
  const buf = fs.readFileSync(binaryPath);
  const haystack = buf.toString('binary');
  if (haystack.includes(PATCHED_URL)) {
    return { ok: true, message: 'Already patched' };
  }
  const idx = haystack.indexOf(ORIGINAL_URL);
  if (idx === -1) {
    return { ok: false, message: 'Original URL not found in binary (incompatible version?)' };
  }
  const backupPath = binaryPath + '.bak';
  if (!fs.existsSync(backupPath)) {
    try {
      fs.copyFileSync(binaryPath, backupPath);
    } catch (e) {
      return { ok: false, message: `Failed to create backup: ${(e as Error).message}` };
    }
  }
  const target = Buffer.from(PATCHED_URL, 'binary');
  const out = Buffer.from(buf);
  target.copy(out, idx);
  try {
    fs.writeFileSync(binaryPath, out);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'EBUSY') {
      return { ok: false, message: 'language_server is running. Close Antigravity and retry.' };
    }
    return { ok: false, message: `Failed to write binary: ${err.message}` };
  }
  return { ok: true, message: `Patched (backup at ${backupPath})` };
}

/** Restore the language server binary from its .bak backup. */
export function restorePatch(installDir?: string): { ok: boolean; message: string } {
  const binaryPath = getLanguageServerBinary(installDir);
  const backupPath = getLanguageServerBackup(installDir);
  if (!binaryPath || !backupPath) {
    return { ok: false, message: 'Binary or backup path not found' };
  }
  if (!fs.existsSync(backupPath)) {
    return { ok: false, message: 'No backup file found' };
  }
  fs.copyFileSync(backupPath, binaryPath);
  return { ok: true, message: 'Restored from backup' };
}
