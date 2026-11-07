import {defineCommand} from 'citty'
import {initCommand} from './init.js'
import {toolsCommand} from './tools.js'
import {extensionCommands} from './extension-commands.js'

export const main = defineCommand({
  meta: {name: 'conciv', description: 'The conciv dev-agent CLI.'},
  subCommands: async () => ({tools: toolsCommand, init: initCommand, ...(await extensionCommands())}),
})
