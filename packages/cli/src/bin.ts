#!/usr/bin/env node
import {realpathSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
import {defineCommand} from 'citty'
import {initCommand} from './init.js'
import {runCli} from './run.js'
import {toolsCommand} from './tools.js'

export const main = defineCommand({
  meta: {name: 'conciv', description: 'The conciv dev-agent CLI.'},
  subCommands: {tools: toolsCommand, init: initCommand},
})

const entry = process.argv[1]

if (entry && import.meta.url === pathToFileURL(realpathSync(entry)).href) {
  void runCli(main, process.argv.slice(2)).then((code) => {
    process.exitCode = code
  })
}
