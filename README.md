# ContextBridge

Git-style version control for your AI session context. Works across every tool you use.

[![npm version](https://img.shields.io/npm/v/contextbridge.svg)](https://npmjs.org/package/contextbridge) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## The problem

Working with AI assistants involves constantly running into context limits or losing the thread when switching between tools. Every time you start a new conversation, you have to painstakingly rebuild the project's current state and goals.

## How it works

```bash
cb init          # set up once per project
cb capture       # after any AI session — auto-reads your git diff
cb inject        # before starting a new session — injects context everywhere
```

## Installation

```bash
npm install -g contextbridge
# or without installing:
npx contextbridge init
```

## Provider setup

`cb init` walks you through choosing an LLM provider for summarisation.

| Provider ID | Model used | Note |
|---|---|---|
| `anthropic` | `claude-haiku-4-5-20251001` | Recommended. Requires API key. |
| `openai` | `gpt-4o-mini` | Good alternative. Requires API key. |
| `gemini` | `gemini-2.0-flash` | Google's option. Requires API key. |
| `ollama` | `qwen2.5-coder:7b` (user-configurable) | Free and private. Requires local Ollama. |

## Tool-specific injection

What happens when you run `cb inject`:
- **Antigravity:** `AGENTS.md` is written automatically to your project root. Antigravity reads it on every agent task. Nothing else needed.
- **Codex:** `cb inject --codex | codex exec -` pipes context directly into a new session.
- **Browser tools (Claude, ChatGPT, Gemini):** context is copied to clipboard automatically. Paste it at the start of your conversation.

## Privacy

All context is stored locally in `~/.contextbridge/` on your machine. When using a cloud provider, only the LLM summary request is sent — not your raw git diff or clipboard content. When using Ollama, nothing leaves your machine.

## Session history

Use `cb log` to see the full version history of your AI sessions.
