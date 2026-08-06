import type {HarnessInitContribution} from '@conciv/protocol/harness-types'

export const opencodeInit: HarnessInitContribution<'opencode'> = {
  harnessId: 'opencode',
  detection: {bin: 'opencode', configDir: ['.config', 'opencode']},
  init: 'none',
}
