import type {HarnessInitContribution} from '@conciv/protocol/harness-types'

export const codexInit: HarnessInitContribution<'codex'> = {
  harnessId: 'codex',
  detection: {bin: 'codex', configDir: ['.codex']},
  hub: {
    add: (command, env) => [
      'codex',
      'mcp',
      'add',
      'conciv-hub',
      ...Object.entries(env).flatMap(([name, value]) => ['--env', `${name}=${value}`]),
      '--',
      ...command,
    ],
  },
  init: 'none',
}
