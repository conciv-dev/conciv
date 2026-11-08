import type {HarnessInitContribution} from '@conciv/protocol/harness-types'

export const geminiCliInit: HarnessInitContribution<'gemini-cli'> = {
  harnessId: 'gemini-cli',
  detection: {bin: 'gemini', configDir: ['.gemini']},
  hub: {
    add: (command, env) => [
      'gemini',
      'mcp',
      'add',
      '-s',
      'user',
      ...Object.entries(env).map(([name, value]) => `--env=${name}=${value}`),
      'conciv-hub',
      ...command,
    ],
  },
  init: 'none',
}
