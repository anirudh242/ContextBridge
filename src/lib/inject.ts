import fs from 'node:fs/promises';
import path from 'node:path';
import { formatRelativeTime } from '../utils/display.js';
import type { ContextSummary, InjectContext, StoreEntry } from '../types.js';

function renderList(items: string[] | undefined, emptyLabel = 'Unknown'): string {
  if (!items || items.length === 0) {
    return `- ${emptyLabel}`;
  }

  return items.map((item) => `- ${item}`).join('\n');
}

function getFallbackTask(entry: StoreEntry): string {
  if (entry.raw.note.trim()) {
    return entry.raw.note.trim();
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

function containsGenericAdvice(summary: ContextSummary): boolean {
  const text = [
    summary.projectGoal,
    summary.currentDirection,
    summary.currentFocus,
    summary.stack,
    ...summary.decisions,
    ...summary.blockers,
    ...summary.nextSteps,
  ].join(' ').toLowerCase();

  return [
    'create a new branch',
    'commit the changes',
    'descriptive messages',
    'deploy to staging',
    'lazy loading',
    'react hooks',
    'user interface',
    'optimize rendering',
    'implement unit tests',
    'improve readability',
    'refactor existing code',
  ].some((pattern) => text.includes(pattern));
}

function conflictsWithGrounding(summary: ContextSummary, repoGrounding: string): boolean {
  const grounding = repoGrounding.toLowerCase();
  const summaryText = [
    summary.projectGoal,
    summary.currentDirection,
    summary.currentFocus,
    summary.stack,
    ...summary.decisions,
    ...summary.nextSteps,
  ].join(' ').toLowerCase();

  const mentionsReact = /\breact\b/.test(summaryText);
  const groundingHasReact = /\breact\b/.test(grounding);
  const mentionsUiFeature = /user interface|list items|rendering/.test(summaryText);

  return (mentionsReact && !groundingHasReact) || mentionsUiFeature;
}

function getTrustedSummary(entry: StoreEntry): ContextSummary | null {
  if (!entry.summary) {
    return null;
  }

  const missingCore = entry.summary.projectGoal === 'Unknown'
    || entry.summary.currentDirection === 'Unknown'
    || entry.summary.currentFocus === 'Unknown';

  if (missingCore || containsGenericAdvice(entry.summary) || conflictsWithGrounding(entry.summary, entry.raw.repoGrounding)) {
    return null;
  }

  return entry.summary;
}

function sortNewestFirst(entries: StoreEntry[]): StoreEntry[] {
  return [...entries].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

function findTrustedSummaryEntry(entry: StoreEntry, entries: StoreEntry[] = []): StoreEntry | null {
  const candidates = entries.length > 0 ? entries : [entry];
  return sortNewestFirst(candidates).find((candidate) => getTrustedSummary(candidate) !== null) ?? null;
}

function buildFallbackDirection(entry: StoreEntry, summary: ContextSummary | null, trustedEntry: StoreEntry | null): string {
  if (summary?.currentDirection && trustedEntry?.id === entry.id) {
    return summary.currentDirection;
  }

  if (summary?.currentDirection && trustedEntry) {
    return summary.currentDirection;
  }

  const grounding = entry.raw.repoGrounding.trim();
  if (grounding) {
    return 'No trusted summary is available yet. Use the project grounding below as the current source of truth.';
  }

  return 'Unknown';
}

export function formatContextForInjection({ projectName, entry, entries = [] }: InjectContext): string {
  const trustedEntry = findTrustedSummaryEntry(entry, entries);
  const summary = trustedEntry ? getTrustedSummary(trustedEntry) : null;
  const grounding = compactGrounding(entry.raw.repoGrounding);
  const fallbackProjectGoal = getPackageDescription(entry.raw.repoGrounding);

  return [
    `[ContextBridge] Project: ${projectName} | Branch: ${entry.branch ?? 'unknown'} | Captured: ${formatRelativeTime(entry.timestamp)}`,
    trustedEntry && trustedEntry.id !== entry.id
      ? `[ContextBridge] Summary source: latest trusted capture from ${formatRelativeTime(trustedEntry.timestamp)}`
      : '',
    '',
    `What we're building: ${summary?.projectGoal ?? fallbackProjectGoal}`,
    '',
    `Current direction: ${buildFallbackDirection(entry, summary, trustedEntry)}`,
    '',
    `Current implementation focus: ${summary?.currentFocus ?? getFallbackTask(entry)}`,
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
