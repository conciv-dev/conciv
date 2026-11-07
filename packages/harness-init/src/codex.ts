import type {HarnessInitContribution} from '@conciv/protocol/harness-types'

export const codexInit: HarnessInitContribution<'codex'> = {
  harnessId: 'codex',
  detection: {bin: 'codex', configDir: ['.codex']},
  hub: {add: (command) => ['codex', 'mcp', 'add', 'conciv-hub', '--', ...command]},
  init: 'none',
}
