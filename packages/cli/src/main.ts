import {defineCommand} from 'citty'
import {initCommand} from './init.js'
import {toolsCommand} from './tools.js'

export const main = defineCommand({
  meta: {name: 'conciv', description: 'The conciv dev-agent CLI.'},
  subCommands: {tools: toolsCommand, init: initCommand},
})
