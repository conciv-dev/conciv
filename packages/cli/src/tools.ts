import {defineCommand} from 'citty'
import {serverCommand} from './server.js'
import {pageCommand} from './page.js'
import {testCommand} from './test.js'
import {openCommand} from './open.js'

// `aidx tools` — the agent's surface for the live dev server.
export const toolsCommand = defineCommand({
  meta: {name: 'tools', description: 'inspect & drive the live dev server — page, server, tests'},
  subCommands: {server: serverCommand, page: pageCommand, test: testCommand, open: openCommand},
})
