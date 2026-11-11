---
'@conciv/ai': patch
'@conciv/protocol': patch
'@conciv/chat': patch
'@conciv/harness': patch
---

Drop the last local patches on the TanStack AI packages. conciv now keeps tool-call metadata, failed results and a stable message id in its own middleware, carries its own call ids on code-mode child calls, validates code-mode tool input and output itself, reads the Claude Code context window from `modelUsage`, and lets the local sandbox forget finished runs. The session's effort now reaches the harness as `HarnessChatDeps.effort`: the Claude harness runs the CLI with `CLAUDE_CODE_EFFORT_LEVEL`, so Claude 5 models get the picked effort too, and codex reads it for `model_reasoning_effort`.
