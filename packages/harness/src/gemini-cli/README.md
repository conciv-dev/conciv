# harness/src/gemini-cli

## Overview

Gemini CLI harness, registered from the package entry (no export subpath). It chats over ACP by spawning `gemini --acp -m <model>` and has a fixed model list. No history, no connect plan, no MCP.

## Invariants

- The model list is fixed: `gemini-3-pro-preview` (default), `gemini-3-flash-preview`, `gemini-2.5-pro`, `gemini-2.5-flash` (`gemini-cli.ts`).
- Every permission the CLI asks goes through `deps.askPermission`; a resumed turn passes `modelOptions.sessionId` (`acpChatConfig`).

## Side Effects

- The chat adapter spawns `gemini --acp -m <model>` through `acp` and asks each permission through `deps.askPermission` (`gemini-cli.ts`).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/harness` from the repo root (turbo builds the package and its dependencies first)
