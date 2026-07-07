/**
 * Read/write the custom_models.json file.
 *
 * Note: this module only handles the plaintext JSON representation.
 * Encryption is handled by the running Electron app via safeStorage.
 * For CLI inspection / migration purposes we read/write the file as-is.
 */
import fs from 'fs';
import path from 'path';
import { getCustomModelsPath, getAntigravityDataDir } from './paths';
import type { CustomModel, CustomModelsFile } from '../types';

const KNOWN_PROVIDERS = new Set([
  'openai',
  'anthropic',
  'openrouter',
  'ollama',
  'google',
  'custom',
  'deepseek',
  'groq',
  'mistral',
  'cerebras',
  'kimi',
  'fireworks',
  'lmstudio',
  'llamacpp',
  'nvidia',
  'opencode',
  'codestral',
  'wafer',
  'zai',
]);

export function loadCustomModels(filePath?: string): CustomModelsFile {
  const fp = filePath ?? getCustomModelsPath();
  if (!fs.existsSync(fp)) {
    return { models: [] };
  }
  const raw = fs.readFileSync(fp, 'utf-8').replace(/^\uFEFF/, '');
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.models)) {
    return { models: [] };
  }
  return { models: parsed.models as CustomModel[] };
}

export function saveCustomModels(
  file: CustomModelsFile,
  filePath?: string,
): void {
  const fp = filePath ?? getCustomModelsPath();
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(file, null, 2), 'utf-8');
}

export function addCustomModel(model: CustomModel, filePath?: string): CustomModelsFile {
  const file = loadCustomModels(filePath);
  const idx = file.models.findIndex((m) => m.name === model.name);
  if (idx >= 0) {
    file.models[idx] = model;
  } else {
    file.models.push(model);
  }
  saveCustomModels(file, filePath);
  return file;
}

export function removeCustomModel(name: string, filePath?: string): CustomModelsFile {
  const file = loadCustomModels(filePath);
  file.models = file.models.filter((m) => m.name !== name);
  saveCustomModels(file, filePath);
  return file;
}

/** Heuristic: detect if the file contains encrypted API keys (opaque strings). */
export function looksEncrypted(filePath?: string): boolean {
  const fp = filePath ?? getCustomModelsPath();
  if (!fs.existsSync(fp)) return false;
  const file = loadCustomModels(fp);
  return file.models.some(
    (m) => typeof m.apiKey === 'string' && m.apiKey.length > 0 && !m.apiKey.startsWith('sk-') && !m.apiKey.startsWith('AIza'),
  );
}

export interface ValidationIssue {
  model: string;
  field: string;
  message: string;
}

export function validateCustomModels(file: CustomModelsFile): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const m of file.models) {
    if (!m.name || !m.name.startsWith('models/')) {
      issues.push({ model: m.name ?? '<unnamed>', field: 'name', message: 'must start with "models/"' });
    }
    if (!m.provider) {
      issues.push({ model: m.name, field: 'provider', message: 'is required' });
    } else if (!KNOWN_PROVIDERS.has(m.provider)) {
      issues.push({ model: m.name, field: 'provider', message: `unknown provider "${m.provider}"` });
    }
    if (!m.apiUrl) {
      issues.push({ model: m.name, field: 'apiUrl', message: 'is required' });
    } else {
      try {
        new URL(m.apiUrl);
      } catch {
        issues.push({ model: m.name, field: 'apiUrl', message: 'is not a valid URL' });
      }
    }
    if (!m.externalModelName) {
      issues.push({ model: m.name, field: 'externalModelName', message: 'is required' });
    }
  }
  return issues;
}

/** Returns the data dir, creating it if needed. */
export function ensureDataDir(): string {
  const dir = getAntigravityDataDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
