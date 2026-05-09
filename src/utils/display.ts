import boxen from 'boxen';
import chalk from 'chalk';
import type { ContextSummary } from '../types.js';

type PanelColor = 'blue' | 'cyan' | 'green' | 'yellow';

const colorMap: Record<PanelColor, (text: string) => string> = {
  blue: chalk.blue,
  cyan: chalk.cyan,
  green: chalk.green,
  yellow: chalk.yellow,
};

export function formatRelativeTime(input: string | Date): string {
  const value = typeof input === 'string' ? new Date(input) : input;
  const diffMs = Date.now() - value.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) {
    return 'just now';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

export function printPanel(content: string, color: PanelColor = 'cyan'): void {
  console.log(
    boxen(colorMap[color](content), {
      padding: 1,
      borderColor: color,
      borderStyle: 'round',
    }),
  );
}

export function printSuccess(title: string, lines: string[] = []): void {
  const content = [chalk.bold(title), ...lines].join('\n');
  printPanel(content, 'green');
}

export function printWarning(message: string): void {
  printPanel(message, 'yellow');
}

export function printInfo(message: string): void {
  console.log(chalk.cyan(message));
}

export function printInfoPanel(title: string, lines: string[] = []): void {
  const content = [chalk.bold(title), ...lines].join('\n');
  printPanel(content, 'blue');
}

export function formatSummaryLines(summary: ContextSummary): string[] {
  return [
    `Project: ${summary.projectGoal ?? 'Unknown'}`,
    `Direction: ${summary.currentDirection ?? 'Unknown'}`,
    `Focus: ${summary.currentFocus ?? 'Unknown'}`,
    `Decisions: ${summary.decisions.join(' | ') || 'Unknown'}`,
    `Blockers: ${summary.blockers.join(' | ') || 'None'}`,
    `Stack: ${summary.stack ?? 'Unknown'}`,
    `Next steps: ${summary.nextSteps.join(' | ') || 'Unknown'}`,
  ];
}
