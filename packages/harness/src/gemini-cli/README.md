# harness/src/gemini-cli

## Overview

Gemini CLI harness, published as `./gemini-cli`. It chats over ACP by spawning `gemini --acp -m <model>` and has a fixed model list. No history, no connect plan, no MCP.

## Interface

- `geminiCli` (`index.ts`): id `'gemini-cli'`, binName `'gemini'`, displayName `'Gemini CLI'`; capabilities resume true, `permissionGate: 'callback'`, transcriptHistory false, compaction false, `systemPrompt: 'flag'`, `mcp: 'none'`, `slashCommands: 'none'`, imageInput false, `init: 'none'`.
- `chatConfig` = ``acpChatConfig('gemini-cli', (model) => `gemini --acp -m ${model}`, 'gemini-3-pro-preview')`` (`index.ts`).
- `GEMINI_MODELS` (`index.ts`): `gemini-3-pro-preview` (default), `gemini-3-flash-preview`, `gemini-2.5-pro`, `gemini-2.5-flash` (group `'Gemini'`).

## Invariants

- None

## Side Effects

- The chat adapter spawns `gemini --acp -m <model>` through `acp` (`../_shared/acp.ts`).

## Verification

- Run: `cd packages/harness && pnpm test`
