import {defineCommand} from 'citty'
import {authCommand} from './auth.js'
import {initCommand} from './init.js'
import {toolsCommand} from './tools.js'
import cliManifest from '../package.json' with {type: 'json'}

export const main = defineCommand({
  meta: {name: 'conciv', version: cliManifest.version, description: 'The conciv dev-agent CLI.'},
  subCommands: {tools: toolsCommand, init: initCommand, auth: authCommand},
})
