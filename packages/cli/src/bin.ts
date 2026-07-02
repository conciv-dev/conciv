#!/usr/bin/env node
import {defineCommand, runMain} from 'citty'
import {toolsCommand} from './tools.js'
import {uiCommand} from './ui.js'

const main = defineCommand({
  meta: {name: 'conciv', description: 'The conciv dev-agent CLI.'},
  subCommands: {tools: toolsCommand, ui: uiCommand},
})

void runMain(main)
