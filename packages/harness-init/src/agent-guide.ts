export const CONCIV_BIN = '.conciv/bin/conciv'

export const CONCIV_RANKING_SENTENCE = `This project has conciv installed. For everything in the running browser, use the conciv CLI through Bash (\`${CONCIV_BIN} tools page ...\`, \`${CONCIV_BIN} tools react ...\`, \`${CONCIV_BIN} tools server ...\`). Use browser MCP tools only when a conciv command cannot do what you need.`

export const CONCIV_COMMAND_GUIDE = [
  '### When to use conciv instead of the browser MCP',
  '',
  'Use the browser MCP for plain navigation, clicks and screenshots. For anything about why the page',
  'looks or behaves the way it does, use conciv first. Every command prints JSON. Start with',
  `\`${CONCIV_BIN} tools page snapshot\` to get a ref or a selector for the element you care about.`,
  '',
  `- Which component rendered an element, and the source file and line: \`${CONCIV_BIN} tools react locate <selector>\``,
  `- Props, state, hooks and context of a live component: \`${CONCIV_BIN} tools react inspect <selector>\``,
  `- Every mounted instance of a component by name: \`${CONCIV_BIN} tools react find <ComponentName>\``,
  `- A value that stays stale, a list that does not refresh, cached data: \`${CONCIV_BIN} tools react inspect\` on the component, then \`${CONCIV_BIN} tools page eval\` to read the store or query cache on \`window\``,
  `- An element that cannot be clicked or is not visible: \`${CONCIV_BIN} tools page query <selector>\` for its box and styles, \`${CONCIV_BIN} tools page eval\` with \`getComputedStyle\` and \`elementFromPoint\``,
  `- Browser console errors and warnings: \`${CONCIV_BIN} tools page console\``,
  `- Unexpected re-renders or a memo that never updates: \`${CONCIV_BIN} tools react track <selector>\``,
  `- Module graph, transformed source, a forced hot update: \`${CONCIV_BIN} tools server graph|transform|reload\``,
].join('\n')
