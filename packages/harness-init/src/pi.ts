import type {HarnessInitContribution} from '@conciv/protocol/harness-types'

export const piInit: HarnessInitContribution<'pi'> = {
  harnessId: 'pi',
  detection: {bin: 'pi', configDir: ['.pi']},
  init: 'none',
}
