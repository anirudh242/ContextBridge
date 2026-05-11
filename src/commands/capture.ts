import clipboard from 'clipboardy';
import { randomUUID } from 'node:crypto';
import type { Command } from 'commander';
import ora from 'ora';
import { loadConfig } from '../lib/config.js';
import { addEntryToProjectStore, ensureProjectStore } from '../lib/store.js';
import { getCurrentBranch, getGitContext } from '../lib/git.js';
import { summariseContent } from '../lib/llm.js';
import { buildProjectGrounding } from '../lib/project.js';
import { formatSummaryLines, printSuccess, printWarning } from '../utils/display.js';
import type { ContextSummary, RawCapture, StoreEntry } from '../types.js';

interface CaptureOptions {
  paste?: boolean;
  message?: string;
}

function hasContent(value: string): boolean {
  return value.trim().length > 0;
}

function buildRawContent(raw: RawCapture): string {
  const parts: string[] = [];

  if (hasContent(raw.note)) {
    parts.push(`Manual note:\n${raw.note}`);
  }

  if (hasContent(raw.clipboard)) {
    parts.push(`Clipboard:\n${raw.clipboard}`);
  }

  if (hasContent(raw.repoGrounding)) {
    parts.push(raw.repoGrounding);
  }

  if (hasContent(raw.gitLog)) {
    parts.push(`Git log:\n${raw.gitLog}`);
  }

  if (hasContent(raw.gitStatus)) {
    parts.push(`Git status:\n${raw.gitStatus}`);
  }

  if (hasContent(raw.gitDiff)) {
    parts.push(`Git diff:\n${raw.gitDiff}`);
  }

  return parts.join('\n\n');
}

function extractStackHint(repoGrounding: string): string {
  const match = repoGrounding.match(/dependencies:\s*(.+)/i);
  return match?.[1]?.trim() || 'Unknown';
}

function extractLabeledValue(note: string, label: string, stopLabels: string[]): string {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedStops = stopLabels.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(
    `${escapedLabel}\\s*:\\s*([\\s\\S]*?)(?=\\s+(?:${escapedStops.join('|')})\\s*:|$)`,
    'i',
  );
  return note.match(pattern)?.[1]?.trim() ?? '';
}

function splitList(value: string): string[] {
  return value
    .split(/;|\n/)
    .map((item) => item.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 3);
}

function buildManualSummary(note: string, repoGrounding: string): ContextSummary {
  const labels = ['Project goal', 'Current direction', 'Current focus', 'Decisions', 'Blockers', 'Next steps'];
  const projectGoal = extractLabeledValue(note, 'Project goal', labels)
    || note.split(/current direction:/i)[0]?.trim()
    || 'Unknown';
  const currentDirection = extractLabeledValue(note, 'Current direction', labels)
    || note.split(/current direction:/i)[1]?.trim()
    || note.trim();
  const currentFocus = extractLabeledValue(note, 'Current focus', labels) || currentDirection;
  const decisions = splitList(extractLabeledValue(note, 'Decisions', labels));
  const blockers = splitList(extractLabeledValue(note, 'Blockers', labels));
  const nextSteps = splitList(extractLabeledValue(note, 'Next steps', labels));

  return {
    projectGoal,
    currentDirection,
    currentFocus,
    decisions,
    blockers: blockers.length > 0 ? blockers : ['None'],
    stack: extractStackHint(repoGrounding),
    nextSteps,
  };
}

function shouldUseManualSummary(raw: RawCapture): boolean {
  return hasContent(raw.note) && !hasContent(raw.clipboard);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerCaptureCommand(program: Command): void {
  program
    .command('capture')
    .description('Capture the latest session context')
    .option('--paste', 'Read clipboard content as an additional capture source')
    .option('-m, --message <text>', 'Add a quick manual note')
    .action(async (options: CaptureOptions) => {
      const spinner = ora('Capturing session...').start();
      const projectPath = process.cwd();

      try {
        const config = await loadConfig();
        await ensureProjectStore(projectPath);

        const gitContext = await getGitContext(projectPath);
        const repoGrounding = await buildProjectGrounding(projectPath);
        const raw: RawCapture = {
          gitDiff: gitContext.diff ?? '',
          gitLog: gitContext.log ?? '',
          gitStatus: gitContext.status ?? '',
          repoGrounding,
          clipboard: '',
          note: options.message ?? '',
        };

        if (options.paste) {
          try {
            raw.clipboard = await clipboard.read();
          } catch {
            spinner.warn('Clipboard read failed. Continuing without clipboard content.');
            spinner.start('Capturing session...');
          }
        }

        const warnings = [...gitContext.warnings];
        const content = buildRawContent(raw);
        const sources = [raw.gitDiff, raw.gitLog, raw.gitStatus, raw.repoGrounding, raw.clipboard, raw.note].filter(hasContent);

        if (sources.length === 0) {
          spinner.fail('Nothing to capture. Add a note, copy context, or make code changes first.');
          return;
        }

        let summary: ContextSummary | null = null;

        if (shouldUseManualSummary(raw)) {
          summary = buildManualSummary(raw.note, raw.repoGrounding);
          spinner.succeed('Captured manual note as the primary direction signal.');
        } else {
          try {
            summary = await summariseContent(content, config);
            spinner.succeed('Session captured and summarised.');
          } catch (error: unknown) {
            const message = getErrorMessage(error);
            spinner.warn(`Summarisation failed: ${message}`);
            warnings.push(`Summarisation failed: ${message}`);

            if (shouldUseManualSummary(raw)) {
              summary = buildManualSummary(raw.note, raw.repoGrounding);
              warnings.push('Fell back to the manual note because summarisation was not trustworthy.');
            }
          }
        }

        const entry: StoreEntry = {
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          branch: (await getCurrentBranch(projectPath)) ?? 'unknown',
          summary,
        };

        await addEntryToProjectStore(projectPath, entry, raw);

        if (summary) {
          printSuccess('Context saved', formatSummaryLines(summary));
        } else {
          printWarning('Raw context saved without summary.');
        }

        for (const warning of warnings) {
          printWarning(warning);
        }
      } catch (error: unknown) {
        spinner.fail(`Capture failed: ${getErrorMessage(error)}`);
        process.exitCode = 1;
      }
    });
}
