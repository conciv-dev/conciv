import {defineCommand} from 'citty'
import {DESIGN_TOOL_DEFS, DESIGN_TOOL_PREFIX} from '@conciv/extension-design/defs'
import {serverCommand} from './server.js'
import {pageCommand, reactCommand} from './page.js'
import {openCommand} from './open.js'
import {toolGroupCommand} from './tool-group.js'

const designCommand = toolGroupCommand({
  prefix: DESIGN_TOOL_PREFIX,
  name: 'design',
  description: 'match the live page to a design image; run --help for every capability',
  builtIns: DESIGN_TOOL_DEFS,
})

export const toolsCommand = defineCommand({
  meta: {name: 'tools', description: 'inspect & drive the live dev server: page, react, design, server'},
  subCommands: {
    server: serverCommand,
    page: pageCommand,
    react: reactCommand,
    design: designCommand,
    open: openCommand,
  },
})
