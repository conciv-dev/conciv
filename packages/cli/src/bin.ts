#!/usr/bin/env node
import {defineCommand, runMain} from 'citty'
import {toolsCommand} from './tools.js'
import {uiCommand} from './ui.js'

// The agent-facing `aidx` binary. The plugin drops a shim to this on the spawned agent's
// PATH so it can call `aidx tools …` / `aidx ui …` against the running dev server.
const main = defineCommand({
  meta: {name: 'aidx', description: 'The aidx dev-agent CLI.'},
  subCommands: {tools: toolsCommand, ui: uiCommand},
})

void runMain(main)
