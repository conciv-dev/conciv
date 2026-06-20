#!/usr/bin/env node
import {defineCommand, runMain} from 'citty'
import {toolsCommand} from './tools.js'
import {uiCommand} from './ui.js'
import {doctorCommand} from './doctor.js'

// The agent-facing `mandarax` binary. The plugin drops a shim to this on the spawned agent's
// PATH so it can call `mandarax tools …` / `mandarax ui …` against the running dev server.
const main = defineCommand({
  meta: {name: 'mandarax', description: 'The mandarax dev-agent CLI.'},
  subCommands: {tools: toolsCommand, ui: uiCommand, doctor: doctorCommand},
})

void runMain(main)
