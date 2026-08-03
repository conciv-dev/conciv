import type {HarnessConnectContext} from '@conciv/protocol/harness-types'
import type {TtyCommand} from '@conciv/protocol/terminal-types'
import {claudeConnectArgs} from './args.js'

const NESTED_SESSION_MARKERS = ['CLAUDECODE', 'CLAUDE_CODE_', 'CLAUDE_EFFORT', 'AI_AGENT']

export function claudeTtyCommand(ctx: HarnessConnectContext): TtyCommand {
  return {
    bin: 'claude',
    args: claudeConnectArgs(ctx),
    env: {TERM: 'xterm-256color', COLORTERM: 'truecolor'},
    unsetEnvPrefixes: NESTED_SESSION_MARKERS,
  }
}
