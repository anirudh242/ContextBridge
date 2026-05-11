import fs from 'node:fs/promises';
import path from 'node:path';
import { formatRelativeTime } from '../utils/display.js';
import type { ContextSummary, InjectContext, StoreEntry, RawCapture } from '../types.js';
import { loadRawCapture } from './store.js';

function renderList(items: string[] | undefined, emptyLabel = 'Unknown'): string {
  if (!items || items.length === 0) {
    return `- ${emptyLabel}`;
  }

  return items.map((item) => `- ${item}`).join('\n');
}

function getFallbackTask(raw: RawCapture): string {
  if (raw.note.trim()) {
    return raw.note.trim();
  }

  return 'Unknown';
}

function getPackageDescription(repoGrounding: string): string {
  const match = repoGrounding.match(/^description:\s*(.+)$/im);
  return match?.[1]?.trim() || 'Unknown';
}

function compactGrounding(repoGrounding: string): string {
  const lines = repoGrounding
    .split('\n')
    .filter((line) => line.trim() !== 'Project grounding:')
    .map((line) => line.trimEnd());

  const packageStart = lines.findIndex((line) => line.trim() === 'package.json:');
  const readmeStart = lines.findIndex((line) => line.trim() === 'README excerpt:');
  const filesStart = lines.findIndex((line) => line.trim() === 'Relevant files:');

  const packageBlock = packageStart === -1
    ? []
    : lines.slice(packageStart, readmeStart === -1 ? filesStart === -1 ? lines.length : filesStart : readmeStart)
      .filter((line) => line.trim())
      .slice(0, 6);

  const readmeBlock = readmeStart === -1
    ? []
    : [
      'README excerpt:',
      ...lines
        .slice(readmeStart + 1, filesStart === -1 ? lines.length : filesStart)
        .filter((line) => line.trim())
        .filter((line) => !line.startsWith('```'))
        .slice(0, 8),
    ];

  const filesBlock = filesStart === -1
    ? []
    : [
      'Relevant files:',
      ...lines
        .slice(filesStart + 1)
        .filter((line) => /^-\s+/.test(line.trim()))
        .filter((line) => !line.includes('package-lock.json'))
        .slice(0, 10),
    ];

  const compacted = [
    packageBlock.join('\n'),
    readmeBlock.join('\n'),
    filesBlock.join('\n'),
  ].filter(Boolean).join('\n\n');

  return compacted || repoGrounding.trim().slice(0, 1200);
}

function getTrustedSummary(entry: StoreEntry): ContextSummary | null {
  if (!entry.summary) return null;

  const missingCore =
    entry.summary.projectGoal === 'Unknown' &&
    entry.summary.currentDirection === 'Unknown' &&
    entry.summary.currentFocus === 'Unknown';

  return missingCore ? null : entry.summary;
}

function sortNewestFirst(entries: StoreEntry[]): StoreEntry[] {
  return [...entries].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

function findTrustedSummaryEntry(entry: StoreEntry, entries: StoreEntry[] = []): StoreEntry | null {
  const candidates = entries.length > 0 ? entries : [entry];
  return sortNewestFirst(candidates).find((candidate) => getTrustedSummary(candidate) !== null) ?? null;
}

function buildFallbackDirection(raw: RawCapture, summary: ContextSummary | null, trustedEntry: StoreEntry | null, entryId: string): string {
  if (summary?.currentDirection && trustedEntry?.id === entryId) {
    return summary.currentDirection;
  }

  if (summary?.currentDirection && trustedEntry) {
    return summary.currentDirection;
  }

  const grounding = raw.repoGrounding.trim();
  if (grounding) {
    return 'No trusted summary is available yet. Use the project grounding below as the current source of truth.';
  }

  return 'Unknown';
}

export async function formatContextForInjection({ projectName, entry, entries = [] }: InjectContext): Promise<string> {
  const trustedEntry = findTrustedSummaryEntry(entry, entries);
  const summary = trustedEntry ? getTrustedSummary(trustedEntry) : null;
  
  const raw = await loadRawCapture(entry.id);
  if (!raw) {
    throw new Error('Raw capture not found for the head entry.');
  }

  const grounding = compactGrounding(raw.repoGrounding);
  const fallbackProjectGoal = getPackageDescription(raw.repoGrounding);

  return [
    `[ContextBridge] Project: ${projectName} | Branch: ${entry.branch ?? 'unknown'} | Captured: ${formatRelativeTime(entry.timestamp)}`,
    trustedEntry && trustedEntry.id !== entry.id
      ? `[ContextBridge] Summary source: latest trusted capture from ${formatRelativeTime(trustedEntry.timestamp)}`
      : '',
    '',
    `What we're building: ${summary?.projectGoal ?? fallbackProjectGoal}`,
    '',
    `Current direction: ${buildFallbackDirection(raw, summary, trustedEntry, entry.id)}`,
    '',
    `Current implementation focus: ${summary?.currentFocus ?? getFallbackTask(raw)}`,
    '',
    'Recent decisions:',
    renderList(summary?.decisions),
    '',
    'Blockers:',
    renderList(summary?.blockers, 'None'),
    '',
    `Stack: ${summary?.stack ?? 'Unknown'}`,
    '',
    'Next steps:',
    renderList(summary?.nextSteps),
    '',
    'Project grounding:',
    grounding || '- Unknown',
    '',
  ].join('\n');
}

export async function writeAgentsFile(projectPath: string, content: string): Promise<string> {
  const targetPath = path.join(projectPath, 'AGENTS.md');
  await fs.writeFile(targetPath, `${content.trim()}\n`, 'utf8');
  return targetPath;
}
