import type {HarnessInitContribution} from '@conciv/protocol/harness-types'

export const codexInit: HarnessInitContribution<'codex'> = {
  harnessId: 'codex',
  detection: {bin: 'codex', configDir: ['.codex']},
  hub: {
    name: 'Codex',
    shellEnv: 'CODEX_THREAD_ID',
    add: (command, env) => [
      'codex',
      'mcp',
      'add',
      'conciv-hub',
      ...Object.entries(env).flatMap(([name, value]) => ['--env', `${name}=${value}`]),
      '--',
      ...command,
    ],
    remove: ['codex', 'mcp', 'remove', 'conciv-hub'],
  },
  init: 'none',
}
