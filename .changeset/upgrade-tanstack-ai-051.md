---
'@conciv/client': patch
'@conciv/contract': patch
'@conciv/core': patch
'@conciv/harness': patch
'@conciv/page': patch
'@conciv/protocol': patch
'@conciv/tools': patch
'@conciv/ui-kit-chat': patch
'@conciv/ui-kit-chat-tools': patch
---

Bump the `@tanstack/ai` family from the 0.48 lockstep to 0.51 (catalog-only, see `pnpm-workspace.yaml`).
Picks up upstream fix [#1248](https://github.com/TanStack/ai/pull/1248): the client `StreamProcessor`
dropped the first `TEXT_MESSAGE_CONTENT` delta of an assistant turn that called a tool before
replying, so every answer that followed a tool call lost its opening text (an opening code fence,
most visibly).
