---
'@conciv/harness-testkit': patch
---

Tests started from inside an agent shell (Claude Code, Codex, Gemini CLI, opencode) no longer pass that agent's variables to the test engine, so an outside call is not refused as coming from a disconnected agent.
