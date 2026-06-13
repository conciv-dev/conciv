import {defineCommand} from 'citty'
import {viteCommand} from './vite.js'
import {pageCommand} from './page.js'
import {vitestCommand} from './vitest.js'
import {openCommand} from './open.js'

// `devgent tools` — the agent's surface for the live dev server.
export const toolsCommand = defineCommand({
  meta: {name: 'tools', description: 'inspect & drive the live dev server — page, vite, tests'},
  subCommands: {vite: viteCommand, page: pageCommand, vitest: vitestCommand, open: openCommand},
})
