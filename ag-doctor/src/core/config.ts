/**
 * Persistent user configuration for ag-doctor.
 *
 * Stored as JSON in the Antigravity data dir:
 *   ~/.gemini/antigravity/config.json
 *
 * Schema (all fields optional — defaults are applied at read time):
 * {
 *   "mitmPort": 50999,
 *   "logLines": 100,
 *   "doctorInterval": 5000,
 *   "ui": { "theme": "dark", "accent": "#22d3ee" },
 *   "history": { "maxRuns": 50 },
 *   "snapshot": { "enabled": true, "maxSnapshots": 10 }
 * }
 */
import fs from 'fs';
import path from 'path';
import { getAntigravityDataDir } from './paths';
import { getProfilePath } from './profile';

export const CONFIG_FILE = 'config.json';

export interface AgDoctorConfig {
  mitmPort: number;
  logLines: number;
  doctorInterval: number;
  ui: {
    theme: 'dark' | 'light';
    accent: string;
  };
  history: {
    maxRuns: number;
  };
  snapshot: {
    enabled: boolean;
    maxSnapshots: number;
  };
}

export const DEFAULT_CONFIG: AgDoctorConfig = {
  mitmPort: 50999,
  logLines: 100,
  doctorInterval: 5000,
  ui: {
    theme: 'dark',
    accent: '#22d3ee',
  },
  history: {
    maxRuns: 50,
  },
  snapshot: {
    enabled: true,
    maxSnapshots: 10,
  },
};

export function getConfigPath(): string {
  return getProfilePath('config');
}

/** Deep-merge a partial config onto defaults to ensure all keys exist. */
function mergeWithDefaults(partial: Partial<AgDoctorConfig> | null | undefined): AgDoctorConfig {
  if (!partial || typeof partial !== 'object') return { ...DEFAULT_CONFIG };
  const merged: AgDoctorConfig = {
    ...DEFAULT_CONFIG,
    ...partial,
    ui: { ...DEFAULT_CONFIG.ui, ...(partial.ui ?? {}) },
    history: { ...DEFAULT_CONFIG.history, ...(partial.history ?? {}) },
    snapshot: { ...DEFAULT_CONFIG.snapshot, ...(partial.snapshot ?? {}) },
  };
  return merged;
}

/** Read the config from disk. Returns defaults if file is missing or invalid. */
export function loadConfig(): AgDoctorConfig {
  const p = getConfigPath();
  if (!fs.existsSync(p)) return { ...DEFAULT_CONFIG };
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    const parsed = JSON.parse(raw);
    return mergeWithDefaults(parsed);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/** Persist the config to disk. Creates parent dir if needed. */
export function saveConfig(cfg: AgDoctorConfig): void {
  const p = getConfigPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
}

/** Reset config to defaults on disk. Returns the new config. */
export function resetConfig(): AgDoctorConfig {
  saveConfig(DEFAULT_CONFIG);
  return { ...DEFAULT_CONFIG };
}

/**
 * Set a single dotted-path value (e.g. "ui.theme" or "mitmPort").
 * Returns the updated config.
 */
export function setConfigValue(path: string, value: string | number | boolean): AgDoctorConfig {
  const cfg = loadConfig();
  const segments = path.split('.');
  let cursor: Record<string, unknown> = cfg as unknown as Record<string, unknown>;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (typeof cursor[seg] !== 'object' || cursor[seg] === null) cursor[seg] = {};
    cursor = cursor[seg] as Record<string, unknown>;
  }
  const last = segments[segments.length - 1];
  // Coerce known numeric fields
  if (last === 'mitmPort' || last === 'logLines' || last === 'doctorInterval' || last === 'maxSnapshots' || last === 'maxRuns') {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error(`Invalid number for ${path}: ${value}`);
    cursor[last] = n;
  } else if (last === 'enabled') {
    cursor[last] = Boolean(value) && value !== 'false' && value !== '0';
  } else if (last === 'theme') {
    if (value !== 'dark' && value !== 'light') throw new Error(`theme must be 'dark' or 'light'`);
    cursor[last] = value;
  } else {
    cursor[last] = String(value);
  }
  saveConfig(cfg);
  return cfg;
}

/** Get a single dotted-path value. Returns undefined if missing. */
export function getConfigValue(path: string): unknown {
  const cfg = loadConfig();
  const segments = path.split('.');
  let cursor: unknown = cfg;
  for (const seg of segments) {
    if (cursor === null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[seg];
  }
  return cursor;
}
