import type {HarnessInitContribution} from '@conciv/protocol/harness-types'

export const geminiCliInit: HarnessInitContribution<'gemini-cli'> = {
  harnessId: 'gemini-cli',
  detection: {bin: 'gemini', configDir: ['.gemini']},
  hub: {add: (command) => ['gemini', 'mcp', 'add', '-s', 'user', 'conciv-hub', ...command]},
  init: 'none',
}
