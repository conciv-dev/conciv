---
'@conciv/cli': patch
'@conciv/core': patch
---

New `conciv auth link <page-url>` prints a one-time login link for the conciv dev server of the current project, for example `http://localhost:3001/#conciv_otp=123456`. Opening it logs that browser in without reading a code from the terminal, so a headless run (Playwright, `claude -p`) can log in on its own. The code comes from the new `auth.issueCode` procedure, which only the engine token may call.

Outside agents that name the tab they act on (the `conciv` CLI with `--tab`, a `conciv mcp serve` call with a `tab`, and the Claude plugin bridge) no longer get a per-call Approve card for tools that ask: their own permission mode decides. A `conciv` CLI call with no `--tab` that finds its engine through the home db acts on the user's latest tab, so it keeps the Approve card. The agent inside the tab keeps its Approve cards, and the one-time Allow under `hubAccess: 'session'` or `'project'` is unchanged.
