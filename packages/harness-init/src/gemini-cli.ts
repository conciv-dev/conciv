import type {HarnessInitContribution} from '@conciv/protocol/harness-types'

export const geminiCliInit: HarnessInitContribution<'gemini-cli'> = {
  harnessId: 'gemini-cli',
  detection: {bin: 'gemini', configDir: ['.gemini']},
  hub: {
    name: 'Gemini CLI',
    shellEnv: 'GEMINI_CLI',
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
    remove: ['gemini', 'mcp', 'remove', '-s', 'user', 'conciv-hub'],
  },
  init: 'none',
}
