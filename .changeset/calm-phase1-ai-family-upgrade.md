---
'@conciv/core': patch
'@conciv/client': patch
'@conciv/harness': patch
'@conciv/harness-testkit': patch
'@conciv/ui-kit-chat': patch
'@conciv/protocol': patch
'@conciv/extension': patch
'@conciv/contract': patch
'@conciv/tools': patch
'@conciv/ui-kit-chat-tools': patch
'@conciv/app': patch
'@conciv/extension-page': patch
'@conciv/extension-recorder': patch
'@conciv/extension-terminal': patch
'@conciv/extension-test-runner': patch
'@conciv/extension-whiteboard': patch
---

Upgrade the @tanstack/ai family 0.43.1 → 0.48.0 in lockstep (ai-client 0.26.0, ai-solid 0.18.3,
ai-code-mode 0.4.3, ai-isolate-node 0.1.51, ai-isolate-quickjs 0.3.1, ai-mcp 0.3.4, ai-sandbox 0.5.0,
ai-sandbox-local-process 0.2.4, ai-claude-code/ai-codex 0.4.4, ai-opencode/ai-acp 0.3.4). Upstream
moved every sibling package's peer range from an exact pin to a caret range, so the pnpm catalog
comment explaining the old exact-pin poison is rewritten. Code Mode's dynamic binding hook was
renamed `getSkillBindings` → `getSnippetBindings` upstream; a per-turn `RUN_FINISHED` token-usage
chunk can now arrive as either the legacy `TokenUsage` shape or the new AG-UI spec `usage[]` array,
so the run-log fold rebuilds it with `fromSpecTokenUsage` before turning it into a usage snapshot.
