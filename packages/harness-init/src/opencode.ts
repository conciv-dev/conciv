import type {HarnessInitContribution} from '@conciv/protocol/harness-types'

export const opencodeInit: HarnessInitContribution<'opencode'> = {
  harnessId: 'opencode',
  detection: {bin: 'opencode', configDir: ['.config', 'opencode']},
  hub: {
    name: 'OpenCode',
    shellEnv: 'OPENCODE',
    add: (command, env) => [
      'opencode',
      'mcp',
      'add',
      'conciv-hub',
      ...Object.entries(env).map(([name, value]) => `--env=${name}=${value}`),
      '--',
      ...command,
    ],
  },
  init: 'none',
}
