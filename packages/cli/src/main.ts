import {defineCommand} from 'citty'
import {initCommand} from './init.js'
import {toolsCommand} from './tools.js'
import {extensionCommands} from './extension-commands.js'
import {dbCommand} from './db.js'

export const main = defineCommand({
  meta: {name: 'conciv', description: 'The conciv dev-agent CLI.'},
  subCommands: async () => ({tools: toolsCommand, init: initCommand, db: dbCommand, ...(await extensionCommands())}),
})
