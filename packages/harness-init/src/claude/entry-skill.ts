export const CONCIV_ENTRY_SKILL_NAME = 'conciv'

export function concivEntrySkillMarkdown(): string {
  return `---
name: ${CONCIV_ENTRY_SKILL_NAME}
description: Use when a project has conciv installed and a coding agent needs to inspect or act on the app running in the browser (the live page, its React tree, or the dev server) from inside a session.
---

# conciv

conciv exposes the running app and dev server as capabilities you call from code. Discover before
calling — never guess a name from memory.

- \`await external_catalog({})\` lists every capability with its exact call name; \`{search}\`
  filters, \`{name}\` returns one full typed signature.
- Call the exact name the catalog returned. Chain several calls in one execution, not one round
  trip per step.
- Extension-contributed capabilities aren't listed here and aren't fixed — they only show up in
  \`external_catalog({})\`; never treat this skill as exhaustive.
- Needs the project's conciv dev server running. For a one-shot call outside code mode, the CLI
  has the same capabilities directly: \`conciv tools --help\`.

Two worked examples — discover, then call the returned name (never a name guessed from memory):

- Page text: \`await external_catalog({search: 'page'})\` → call the returned name, e.g.
  \`external_page_query({selector: 'h1'})\`.
- Restart dev server: \`await external_catalog({search: 'server'})\` → call the returned name, e.g.
  \`external_server_restart({})\`.

Names above are illustrations, not fixed capabilities — confirm every call against your own catalog.
`
}
