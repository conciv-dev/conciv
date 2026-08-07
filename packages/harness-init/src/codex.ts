import type {HarnessInitContribution} from '@conciv/protocol/harness-types'

export const codexInit: HarnessInitContribution<'codex'> = {
  harnessId: 'codex',
  detection: {bin: 'codex', configDir: ['.codex']},
  init: 'none',
}
