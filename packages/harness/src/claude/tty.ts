import type {TtyCommand, TtyCommandOpts} from '@conciv/protocol/terminal-types'
import {claudeMcpArgs} from './args.js'

const NESTED_SESSION_MARKERS = ['CLAUDECODE', 'CLAUDE_CODE_', 'CLAUDE_EFFORT', 'AI_AGENT']

export function claudeTtyCommand(opts: TtyCommandOpts): TtyCommand {
  const base = opts.resume ? ['--resume', opts.harnessSessionId] : ['--session-id', opts.harnessSessionId]
  const withModel = opts.model ? [...base, '--model', opts.model] : base
  const args = opts.mcpUrl ? [...withModel, ...claudeMcpArgs(opts.mcpUrl, opts.concivSessionId)] : withModel
  return {
    bin: 'claude',
    args,
    env: {TERM: 'xterm-256color', COLORTERM: 'truecolor'},
    unsetEnvPrefixes: NESTED_SESSION_MARKERS,
  }
}
