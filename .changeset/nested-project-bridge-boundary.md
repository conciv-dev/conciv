---
'@conciv/harness-init': patch
---

Fix the claude connect bridge walking past a nested project's `.conciv` directory when it has no
`mcp-endpoint.json`, which let a worktree or sub-project with no running dev server silently bridge
to a parent project's server. The walk now stops at the first ancestor directory that contains a
`.conciv` directory: if that directory has a valid endpoint file it is used, otherwise the bridge
fails naming that directory instead of continuing upward.
