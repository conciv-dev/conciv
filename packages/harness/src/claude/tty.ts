import type {TtyCommand, TtyCommandOpts} from '@conciv/protocol/terminal-types'

export function claudeTtyCommand(opts: TtyCommandOpts): TtyCommand {
  const base = opts.resume ? ['--resume', opts.harnessSessionId] : ['--session-id', opts.harnessSessionId]
  const args = opts.model ? [...base, '--model', opts.model] : base
  return {bin: 'claude', args, env: {TERM: 'xterm-256color', COLORTERM: 'truecolor'}}
}
