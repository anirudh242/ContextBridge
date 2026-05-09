export interface ContextSummary {
  projectGoal: string;
  currentDirection: string;
  currentFocus: string;
  decisions: string[];
  blockers: string[];
  stack: string;
  nextSteps: string[];
}

export interface RawCapture {
  gitDiff: string;
  gitLog: string;
  gitStatus: string;
  repoGrounding: string;
  clipboard: string;
  note: string;
}

export interface StoreEntry {
  id: string;
  timestamp: string;
  branch: string;
  summary: ContextSummary | null;
  raw: RawCapture;
}

export interface ProjectStore {
  name: string;
  head: string | null;
  entries: StoreEntry[];
}

export interface StoreData {
  projects: Record<string, ProjectStore>;
}

export interface AppConfig {
  defaultModel: string;
  ollamaBaseUrl: string;
  ollamaTimeoutMs: number | null;
  projects: Record<string, string>;
}

export interface GitContext {
  diff: string;
  log: string;
  status: string;
  warnings: string[];
}

export interface InjectContext {
  projectName: string;
  entry: StoreEntry;
  entries?: StoreEntry[];
}
