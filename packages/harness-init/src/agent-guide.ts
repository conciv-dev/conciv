export const CONCIV_BIN = '.conciv/bin/conciv'

const pageRun = (action: string) =>
  `${CONCIV_BIN} plugin call experimental.page run --data '{"sessionId":"<sessionId>","action":{${action}}}'`

export const CONCIV_RANKING_SENTENCE = `This project has conciv installed. For everything in the running browser, use the conciv CLI through Bash (\`${CONCIV_BIN} plugin call experimental.page run ...\`, \`${CONCIV_BIN} tools design ...\`, \`${CONCIV_BIN} tools server ...\`). Use browser MCP tools only when a conciv command cannot do what you need.`

export const CONCIV_COMMAND_GUIDE = [
  '### When to use conciv instead of the browser MCP',
  '',
  'Use the browser MCP for plain navigation, clicks and screenshots. For anything about why the page',
  'looks or behaves the way it does, use conciv first. Every command prints JSON. Start with',
  `\`${pageRun('"type":"snapshot"')}\` to get a ref or a selector for the element you care about.`,
  '',
  `- Which component rendered an element, and the source file and line: \`${pageRun('"type":"locate","selector":"<selector>"')}\``,
  `- Props, state, hooks and context of a live component: \`${pageRun('"type":"inspect","selector":"<selector>"')}\``,
  `- Every mounted instance of a component by name: \`${pageRun('"type":"find","name":"<ComponentName>"')}\``,
  `- A value that stays stale, a list that does not refresh, cached data: \`${pageRun('"type":"inspect","name":"<ComponentName>"')}\`, then \`${pageRun('"type":"eval","code":"<expression>"')}\` to read the store or query cache on \`window\``,
  `- An element that cannot be clicked or is not visible: \`${pageRun('"type":"query","selector":"<selector>"')}\` for its box and styles, \`${pageRun('"type":"eval","code":"<expression>"')}\` with \`getComputedStyle\` and \`elementFromPoint\``,
  `- Browser console errors and warnings: \`${pageRun('"type":"console"')}\``,
  `- Unexpected re-renders or a memo that never updates: \`${pageRun('"type":"track","action":"start"')}\`, reproduce, then \`${pageRun('"type":"track","action":"report"[,"name":"<ComponentName>"]')}\`, then \`${pageRun('"type":"track","action":"stop"')}\``,
  `- Module graph, transformed source, a forced hot update: \`${CONCIV_BIN} tools server graph <file>\`, \`${CONCIV_BIN} tools server transform <url>\`, \`${CONCIV_BIN} tools server reload <file>\``,
  `- Matching a page to a design image: \`${CONCIV_BIN} tools design target <image> --route <route> --width <px>\`, then edit, then \`${CONCIV_BIN} tools design diff\`; fix the first components in the list (sorted by impact) using the source and the deltas, run \`diff\` again, stop when \`${CONCIV_BIN} tools design status\` says done. Do not eyeball the screenshot when \`diff\` is available.`,
].join('\n')
