import {defineCommand} from 'citty'
import {initCommand} from './init.js'
import {toolsCommand} from './tools.js'
import {extensionCommands} from './extension-commands.js'
import {sourceCommands} from './db.js'

const dbCommand = defineCommand({
  meta: {name: 'db', description: 'read and write the conciv database through the sources extensions declare'},
  subCommands: sourceCommands({prefix: '', label: 'every extension'}),
})

export const main = defineCommand({
  meta: {name: 'conciv', description: 'The conciv dev-agent CLI.'},
  subCommands: async () => ({tools: toolsCommand, init: initCommand, db: dbCommand, ...(await extensionCommands())}),
})
