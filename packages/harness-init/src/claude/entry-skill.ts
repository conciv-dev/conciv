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
- Call the exact name the catalog returned. Chain several calls in one execution instead of one
  round trip per step.
- Extension-contributed capabilities are not listed here and are not fixed — they only show up in
  \`external_catalog({})\`, so never treat this skill, or a remembered catalog, as exhaustive.
- All of this needs the project's conciv dev server running. For a single one-shot call outside
  code mode, the CLI has the same capabilities directly: \`conciv tools --help\`.

Examples:

- Read the page \`<h1>\`: \`await external_page_query({selector: 'h1'})\`
- Restart the dev server: \`await external_server_restart({})\`
`
}
