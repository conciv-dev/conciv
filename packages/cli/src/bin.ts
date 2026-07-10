#!/usr/bin/env node
import {defineCommand, runMain} from 'citty'
import {toolsCommand} from './tools.js'

const main = defineCommand({
  meta: {name: 'conciv', description: 'The conciv dev-agent CLI.'},
  subCommands: {tools: toolsCommand},
})

void runMain(main)
