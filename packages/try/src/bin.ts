#!/usr/bin/env node
import {defineCommand, runMain} from 'citty'
import {runConnect} from './connect.js'

const main = defineCommand({
  meta: {name: 'conciv-try', description: 'try conciv live on conciv.dev with the agent on this machine'},
  args: {
    token: {type: 'string', required: true, description: 'pairing token from conciv.dev'},
    harness: {type: 'string', description: 'claude (default), codex, gemini-cli, opencode or pi'},
    workspace: {type: 'string', description: 'pass "." to use the current directory (default: throwaway temp dir)'},
    origin: {type: 'string', description: 'override the allowed browser origin (testing only)'},
  },
  run: async ({args}) => {
    await runConnect({
      token: args.token,
      harness: args.harness,
      workspace: args.workspace,
      origin: args.origin,
      log: (line) => process.stdout.write(line + '\n'),
    })
    await new Promise(() => {})
  },
})

void runMain(main)
