import type {HarnessInitContribution} from '@conciv/protocol/harness-types'

export const geminiCliInit: HarnessInitContribution<'gemini-cli'> = {
  harnessId: 'gemini-cli',
  detection: {bin: 'gemini', configDir: ['.gemini']},
  init: 'none',
}
