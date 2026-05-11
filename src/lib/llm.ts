import type { AppConfig, ContextSummary } from '../types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const DEFAULT_MODEL = 'qwen2.5-coder:7b';
const DEFAULT_URL = 'http://127.0.0.1:11434';
const DEFAULT_TIMEOUT_MS = 120000;

const summarySchema = z.object({
  projectGoal: z.string().default('Unknown'),
  currentDirection: z.string().default('Unknown'),
  currentFocus: z.string().default('Unknown'),
  decisions: z.array(z.string()).max(3).default([]),
  blockers: z.array(z.string()).max(3).default(['None']),
  stack: z.string().default('Unknown'),
  nextSteps: z.array(z.string()).max(3).default([]),
});

const summaryJsonSchema = zodToJsonSchema(summarySchema, 'ContextSummary');

interface OllamaGenerateResponse {
  response?: string;
}

type ParsedSummary = Record<string, unknown>;

function approximateTokens(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function truncateMiddleTokens(text: string, maxTokens = 6000, keepPerSide = 2000): string {
  const tokens = approximateTokens(text);

  if (tokens.length <= maxTokens) {
    return text;
  }

  const head = tokens.slice(0, keepPerSide).join(' ');
  const tail = tokens.slice(-keepPerSide).join(' ');
  return `${head}\n\n[... truncated middle content ...]\n\n${tail}`;
}

function buildPrompt(content: string): string {
  return [
    'You are a developer context summariser.',
    'Given the following content from a coding session, return a JSON object that matches the provided schema.',
    'Field requirements:',
    '- projectGoal: what this project is building overall',
    '- currentDirection: the current product or implementation direction',
    '- currentFocus: the specific work actively being done now',
    '- decisions: up to 3 concrete technical or product decisions made',
    '- blockers: up to 3 active blockers, or ["None"] if absent',
    '- stack: language, frameworks, and the most relevant files touched',
    '- nextSteps: up to 3 concrete implementation steps directly implied by the content',
    'Be specific and technical. Use actual variable names, file names, and error text when present.',
    'If information is missing, write "Unknown".',
    'Do not invent generic workflow advice like creating a branch, committing changes, or writing tests unless the content explicitly says so.',
    `JSON schema: ${JSON.stringify(summaryJsonSchema)}`,
    '',
    'Content:',
    truncateMiddleTokens(content),
  ].join('\n');
}

function buildFallbackPrompt(content: string): string {
  return [
    'You are a developer context summariser.',
    'Return a JSON object that matches the provided schema.',
    'Use short, specific values. If unknown, write "Unknown".',
    'Do not invent generic workflow advice.',
    `JSON schema: ${JSON.stringify(summaryJsonSchema)}`,
    '',
    'Session content:',
    truncateMiddleTokens(content, 2500, 800),
  ].join('\n');
}

async function callAnthropic(prompt: string, config: AppConfig): Promise<string> {
  const model = config.model || 'claude-haiku-4-5-20251001';
  const baseUrl = config.baseUrl || 'https://api.anthropic.com';
  const apiKey = config.apiKey;

  if (!apiKey) throw new Error('Anthropic API key is required');

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) throw new Error(`Anthropic request failed with status ${response.status}`);
  const payload = await response.json() as any;
  return payload.content[0].text;
}

async function callOpenAI(prompt: string, config: AppConfig): Promise<string> {
  const model = config.model || 'gpt-4o-mini';
  const baseUrl = config.baseUrl || 'https://api.openai.com';
  const apiKey = config.apiKey;

  if (!apiKey) throw new Error('OpenAI API key is required');

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
      temperature: 0,
    }),
  });

  if (!response.ok) throw new Error(`OpenAI request failed with status ${response.status}`);
  const payload = await response.json() as any;
  return payload.choices[0].message.content;
}

async function callGemini(prompt: string, config: AppConfig): Promise<string> {
  const model = config.model || 'gemini-2.0-flash';
  const baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com';
  const apiKey = config.apiKey;

  if (!apiKey) throw new Error('Gemini API key is required');

  const response = await fetch(`${baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 1024, temperature: 0 },
    }),
  });

  if (!response.ok) throw new Error(`Gemini request failed with status ${response.status}`);
  const payload = await response.json() as any;
  return payload.candidates[0].content.parts[0].text;
}

async function callOllama(prompt: string, config: AppConfig): Promise<string> {
  const model = config.model || DEFAULT_MODEL;
  const baseUrl = config.baseUrl || DEFAULT_URL;
  const timeoutMs = config.ollamaTimeoutMs === null
    ? null
    : (typeof config.ollamaTimeoutMs === 'number' && Number.isFinite(config.ollamaTimeoutMs)
      ? config.ollamaTimeoutMs
      : DEFAULT_TIMEOUT_MS);

  const signal = timeoutMs === null ? undefined : AbortSignal.timeout(timeoutMs);

  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      format: summaryJsonSchema,
      options: {
        num_predict: 384,
        temperature: 0,
      },
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as OllamaGenerateResponse;
  return payload.response ?? '';
}

async function callLLM(prompt: string, config: AppConfig): Promise<string> {
  switch (config.provider) {
    case 'anthropic':
      return callAnthropic(prompt, config);
    case 'openai':
      return callOpenAI(prompt, config);
    case 'gemini':
      return callGemini(prompt, config);
    case 'ollama':
    default:
      return callOllama(prompt, config);
  }
}

function normaliseList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value
    .map((item) => `${item}`.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function cleanLineValue(value: string): string {
  return value
    .replace(/^[-*]\s*/, '')
    .replace(/^"(.*)"$/, '$1')
    .replace(/^`{1,3}|`{1,3}$/g, '')
    .trim();
}

function extractSection(text: string, label: string, stopLabels: string[]): string {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedStops = stopLabels.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(
    `^\\s*(?:#+\\s*)?${escapedLabel}\\s*:\\s*([\\s\\S]*?)(?=^\\s*(?:#+\\s*)?(?:${escapedStops.join('|')})\\s*:|^\\s*\`\`\`|$)`,
    'im',
  );
  const match = text.match(pattern);
  return match?.[1]?.trim() ?? '';
}

function extractBullets(section: string, fallback: string[]): string[] {
  const bulletLines = section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => cleanLineValue(line))
    .filter((line) => line.length > 0 && line !== 'None');

  if (bulletLines.length > 0) {
    return bulletLines.slice(0, 3);
  }

  const inlineParts = section
    .split(/[|;]/)
    .map((part) => cleanLineValue(part))
    .filter(Boolean)
    .slice(0, 3);

  return inlineParts.length > 0 ? inlineParts : fallback;
}

function sanitizeScalar(value: string, fallback: string): string {
  const cleaned = cleanLineValue(value)
    .replace(/\s+/g, ' ')
    .trim();

  if (
    !cleaned
    || cleaned.length > 240
    || /```/.test(cleaned)
    || /^function\s/i.test(cleaned)
    || /return valid json/i.test(cleaned)
    || /plain text responses/i.test(cleaned)
    || /^here is /i.test(cleaned)
    || /^these functions/i.test(cleaned)
  ) {
    return fallback;
  }

  return cleaned;
}

function sanitizeList(items: string[], fallback: string[]): string[] {
  const cleaned = items
    .map((item) => sanitizeScalar(item, ''))
    .filter(Boolean)
    .filter((item) => !/^(project goal|current direction|current focus|recent decisions|active errors|blockers|stack|next steps)\b/i.test(item))
    .slice(0, 3);

  return cleaned.length > 0 ? cleaned : fallback;
}

function parseSummaryFromText(text: string): ContextSummary {
  const labels = [
    'Project goal',
    'Current direction',
    'Current focus',
    'Recent decisions',
    'Blockers',
    'Active errors',
    'Active errors or blockers',
    'Stack',
    'Stack and key files',
    'Next steps',
  ];

  const projectGoalSection = extractSection(text, 'Project goal', labels);
  const currentDirectionSection = extractSection(text, 'Current direction', labels);
  const currentFocusSection = extractSection(text, 'Current focus', labels);
  const decisionsSection = extractSection(text, 'Recent decisions', labels);
  const blockersSection = extractSection(text, 'Blockers', labels)
    || extractSection(text, 'Active errors', labels)
    || extractSection(text, 'Active errors or blockers', labels);
  const stackSection = extractSection(text, 'Stack', labels)
    || extractSection(text, 'Stack and key files', labels);
  const nextStepsSection = extractSection(text, 'Next steps', labels);
  const detectedSections = [
    projectGoalSection,
    currentDirectionSection,
    currentFocusSection,
    decisionsSection,
    blockersSection,
    stackSection,
    nextStepsSection,
  ].filter(Boolean).length;

  if (detectedSections < 2) {
    throw new Error('Model response did not contain structured summary headings.');
  }

  return {
    projectGoal: sanitizeScalar(projectGoalSection, 'Unknown'),
    currentDirection: sanitizeScalar(currentDirectionSection, 'Unknown'),
    currentFocus: sanitizeScalar(currentFocusSection, 'Unknown'),
    decisions: sanitizeList(extractBullets(decisionsSection, []), []),
    blockers: sanitizeList(extractBullets(blockersSection, ['None']), ['None']),
    stack: sanitizeScalar(stackSection, 'Unknown'),
    nextSteps: sanitizeList(extractBullets(nextStepsSection, []), []),
  };
}

function sanitizeSummary(summary: ContextSummary): ContextSummary {
  return {
    projectGoal: sanitizeScalar(summary.projectGoal, 'Unknown'),
    currentDirection: sanitizeScalar(summary.currentDirection, 'Unknown'),
    currentFocus: sanitizeScalar(summary.currentFocus, 'Unknown'),
    decisions: sanitizeList(summary.decisions, []),
    blockers: sanitizeList(summary.blockers, ['None']),
    stack: sanitizeScalar(summary.stack, 'Unknown'),
    nextSteps: sanitizeList(summary.nextSteps, []),
  };
}

function isWeakSummary(summary: ContextSummary): boolean {
  return (
    summary.projectGoal === 'Unknown' &&
    summary.currentDirection === 'Unknown' &&
    summary.currentFocus === 'Unknown'
  );
}

function parseSummary(text: string): ContextSummary {
  const cleaned = text.trim();
  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');

  if (jsonStart !== -1 && jsonEnd !== -1) {
    const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1)) as ParsedSummary;
    const validated = summarySchema.parse({
      projectGoal: `${parsed.projectGoal ?? 'Unknown'}`.trim() || 'Unknown',
      currentDirection: `${parsed.currentDirection ?? 'Unknown'}`.trim() || 'Unknown',
      currentFocus: `${parsed.currentFocus ?? 'Unknown'}`.trim() || 'Unknown',
      decisions: normaliseList(parsed.decisions, []),
      blockers: normaliseList(parsed.blockers ?? parsed.errors, ['None']),
      stack: `${parsed.stack ?? 'Unknown'}`.trim() || 'Unknown',
      nextSteps: normaliseList(parsed.nextSteps, []),
    });

    const summary = sanitizeSummary(validated);
    if (isWeakSummary(summary)) {
      throw new Error('Model returned a generic or low-signal summary.');
    }

    return summary;
  }

  const parsedFromText = parseSummaryFromText(cleaned);
  const hasAnyStructuredContent = parsedFromText.projectGoal !== 'Unknown'
    || parsedFromText.currentDirection !== 'Unknown'
    || parsedFromText.currentFocus !== 'Unknown'
    || parsedFromText.decisions.length > 0
    || parsedFromText.blockers[0] !== 'None'
    || parsedFromText.stack !== 'Unknown'
    || parsedFromText.nextSteps.length > 0;

  if (!hasAnyStructuredContent) {
    throw new Error('Model response did not contain parseable summary data.');
  }

  if (isWeakSummary(parsedFromText)) {
    throw new Error('Model returned a generic or low-signal summary.');
  }

  return parsedFromText;
}

export async function summariseContent(content: string, config: Partial<AppConfig> = {}): Promise<ContextSummary> {
  const fullConfig = config as AppConfig;
  
  try {
    const rawText = await callLLM(buildPrompt(content), fullConfig);
    return parseSummary(rawText);
  } catch (error: unknown) {
    if (fullConfig.provider === 'ollama' && error instanceof Error && error.name === 'TimeoutError') {
      const rawText = await callLLM(buildFallbackPrompt(content), fullConfig);
      return parseSummary(rawText);
    }
    throw error;
  }
}
