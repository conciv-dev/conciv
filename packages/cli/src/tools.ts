import {defineCommand} from 'citty'
import {serverCommand} from './server.js'
import {pageCommand, reactCommand} from './page.js'
import {testCommand} from './test.js'
import {openCommand} from './open.js'

// `aidx tools` — the agent's surface for the live dev server. `react` is an alias group for the
// React-introspection verbs (also under `page`), where agents intuitively look for them.
export const toolsCommand = defineCommand({
  meta: {name: 'tools', description: 'inspect & drive the live dev server — page, react, server, tests'},
  subCommands: {server: serverCommand, page: pageCommand, react: reactCommand, test: testCommand, open: openCommand},
})
