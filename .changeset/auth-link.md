---
'@conciv/cli': patch
'@conciv/core': patch
---

New `conciv auth link <page-url>` prints a one-time login link for the conciv dev server of the current project, for example `http://localhost:3001/#conciv_otp=123456`. Opening it logs that browser in without reading a code from the terminal, so a headless run (Playwright, `claude -p`) can log in on its own. The code comes from the new `auth.issueCode` procedure, which only the engine token may call.

Outside agents (the `conciv` CLI with `--tab` or a home db engine, `conciv mcp serve`, and the Claude plugin bridge) no longer get a per-call Approve card for tools that ask: their own permission mode decides. The agent inside the tab keeps its Approve cards, and the one-time Allow under `hubAccess: 'session'` or `'project'` is unchanged.
