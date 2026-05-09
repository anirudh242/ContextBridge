import fs from 'node:fs/promises';
import path from 'node:path';
import { getConfigDir } from './config.js';
import type { ProjectStore, StoreData, StoreEntry } from '../types.js';

const STORE_PATH = path.join(getConfigDir(), 'store.json');

function createEmptyStore(): StoreData {
  return {
    projects: {},
  };
}

function getErrorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error
    ? String((error as NodeJS.ErrnoException).code)
    : undefined;
}

export function getStorePath(): string {
  return STORE_PATH;
}

export async function saveStore(store: StoreData): Promise<void> {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

export async function ensureStore(): Promise<StoreData> {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });

  try {
    const existing = await fs.readFile(STORE_PATH, 'utf8');
    const parsed = JSON.parse(existing) as Partial<StoreData>;

    if (!parsed.projects) {
      const normalised = createEmptyStore();
      await saveStore(normalised);
      return normalised;
    }

    return parsed as StoreData;
  } catch (error: unknown) {
    if (getErrorCode(error) !== 'ENOENT') {
      throw error;
    }

    const initial = createEmptyStore();
    await saveStore(initial);
    return initial;
  }
}

export async function loadStore(): Promise<StoreData> {
  return ensureStore();
}

export async function ensureProjectStore(
  projectPath: string,
  projectName = path.basename(projectPath),
): Promise<ProjectStore> {
  const store = await ensureStore();

  if (!store.projects[projectPath]) {
    store.projects[projectPath] = {
      name: projectName,
      head: null,
      entries: [],
    };
    await saveStore(store);
  }

  return store.projects[projectPath];
}

export async function getProjectStore(projectPath: string): Promise<ProjectStore | null> {
  const store = await ensureStore();
  return store.projects[projectPath] ?? null;
}

export async function addEntryToProjectStore(projectPath: string, entry: StoreEntry): Promise<StoreEntry> {
  const store = await ensureStore();
  const project: ProjectStore = store.projects[projectPath] ?? {
    name: path.basename(projectPath),
    head: null,
    entries: [],
  };

  project.entries.push(entry);
  project.head = entry.id;
  store.projects[projectPath] = project;

  await saveStore(store);

  return entry;
}

export async function getHeadEntry(projectPath: string): Promise<StoreEntry | null> {
  const project = await getProjectStore(projectPath);

  if (!project?.head) {
    return null;
  }

  return project.entries.find((entry) => entry.id === project.head) ?? null;
}
