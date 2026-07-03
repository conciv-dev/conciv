import {defineHarness} from '@conciv/protocol/harness-types'
import {buildCodexArgs} from './args.js'
import {codexToAguiEvents} from './decode.js'

export const codex = defineHarness({
  id: 'codex',
  binName: 'codex',
  displayName: 'Codex',
  capabilities: {
    resume: true,
    permissionGate: 'none',
    transcriptHistory: false,
    compaction: false,
    systemPrompt: 'none',
    mcp: 'http',
    slashCommands: 'none',
    imageInput: false,
  },
  buildArgs: buildCodexArgs,
  decode: codexToAguiEvents,

  launch: (ctx) => {
    const argv = ['codex']
    if (ctx.sessionId) argv.push('resume', ctx.sessionId)
    if (ctx.model) argv.push('-m', ctx.model)
    return ctx.openTerminal(argv)
  },
})
