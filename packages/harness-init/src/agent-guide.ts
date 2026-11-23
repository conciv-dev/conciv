export const CONCIV_BIN = '.conciv/bin/conciv'

export const CONCIV_RANKING_SENTENCE = `This project has conciv installed. For everything in the running browser, use the conciv CLI through Bash (\`${CONCIV_BIN} tools page ...\`, \`${CONCIV_BIN} tools design ...\`). Use browser MCP tools only when a conciv command cannot do what you need.`

export const CONCIV_COMMAND_GUIDE = [
  '### When to use conciv instead of the browser MCP',
  '',
  'Use the browser MCP for plain navigation, clicks and screenshots. For anything about why the page',
  'looks or behaves the way it does, use conciv first. Every command prints JSON. Start with',
  `\`${CONCIV_BIN} tools page snapshot\` to get a ref or a selector for the element you care about.`,
  '',
  `- Which component rendered an element, and the source file and line: \`${CONCIV_BIN} tools page locate --selector <selector>\``,
  `- Props, state, hooks and context of a live component: \`${CONCIV_BIN} tools page inspect --selector <selector>\``,
  `- Every mounted instance of a component by name: \`${CONCIV_BIN} tools page find <ComponentName>\``,
  `- A value that stays stale, a list that does not refresh, cached data: \`${CONCIV_BIN} tools page inspect --name <ComponentName>\`, then \`${CONCIV_BIN} tools page eval --code <expression>\` to read the store or query cache on \`window\``,
  `- An element that cannot be clicked or is not visible: \`${CONCIV_BIN} tools page query --selector <selector>\` for its box and styles, \`${CONCIV_BIN} tools page eval --code <expression>\` with \`getComputedStyle\` and \`elementFromPoint\``,
  `- Browser console errors and warnings: \`${CONCIV_BIN} tools page console\``,
  `- Unexpected re-renders or a memo that never updates: \`${CONCIV_BIN} tools page track --action start\`, reproduce, then \`${CONCIV_BIN} tools page track --action report [--name <ComponentName>]\`, then \`${CONCIV_BIN} tools page track --action stop\``,
  `- Module graph and transformed source: \`${CONCIV_BIN} plugin call server graph --data '{"file":"<file>"}'\`, \`${CONCIV_BIN} plugin call server transform --data '{"url":"<url>"}'\``,
  `- Matching a page to a design image: \`${CONCIV_BIN} tools design target <image> --route <route> --width <px>\`, then edit, then \`${CONCIV_BIN} tools design diff\`; fix the first components in the list (sorted by impact) using the source and the deltas, run \`diff\` again, stop when \`${CONCIV_BIN} tools design status\` says done. Do not eyeball the screenshot when \`diff\` is available.`,
].join('\n')
