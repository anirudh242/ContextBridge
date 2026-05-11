import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AppConfig, ProviderConfig } from '../types.js';

const CONFIG_DIR = path.join(os.homedir(), '.contextbridge');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: AppConfig = {
  provider: 'ollama',
  ollamaTimeoutMs: 120000,
  projects: {},
};

function getErrorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error
    ? String((error as NodeJS.ErrnoException).code)
    : undefined;
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

export async function ensureConfig(): Promise<AppConfig> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });

  try {
    const existing = await fs.readFile(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(existing) as Partial<AppConfig>;
    const merged: AppConfig = {
      ...DEFAULT_CONFIG,
      ...parsed,
      projects: {
        ...DEFAULT_CONFIG.projects,
        ...(parsed.projects ?? {}),
      },
    };

    if (JSON.stringify(merged) !== JSON.stringify(parsed)) {
      await saveConfig(merged);
    }

    return merged;
  } catch (error: unknown) {
    if (getErrorCode(error) !== 'ENOENT') {
      throw error;
    }

    await saveConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }
}

export async function loadConfig(): Promise<AppConfig> {
  return ensureConfig();
}

export async function registerProjectInConfig(projectName: string, projectPath: string): Promise<AppConfig> {
  const config = await ensureConfig();
  config.projects[projectName] = projectPath;
  await saveConfig(config);
  return config;
}

export async function setProvider(providerConfig: ProviderConfig): Promise<AppConfig> {
  const config = await ensureConfig();
  config.provider = providerConfig.provider;
  config.apiKey = providerConfig.apiKey;
  config.model = providerConfig.model;
  config.baseUrl = providerConfig.baseUrl;
  await saveConfig(config);
  return config;
}

export async function setTimeout(timeoutMs: number | null): Promise<AppConfig> {
  const config = await ensureConfig();
  config.ollamaTimeoutMs = timeoutMs;
  await saveConfig(config);
  return config;
}
