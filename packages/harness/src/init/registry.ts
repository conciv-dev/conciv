import type {HarnessInitContribution, InitHarnessId} from '@conciv/types/harness-types'
import {claudeInit} from './claude/init.js'

const piInit: HarnessInitContribution<'pi'> = {
  harnessId: 'pi',
  detection: {bin: 'pi', configDir: ['.pi']},
  init: 'none',
}

const opencodeInit: HarnessInitContribution<'opencode'> = {
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

const geminiCliInit: HarnessInitContribution<'gemini-cli'> = {
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

const codexInit: HarnessInitContribution<'codex'> = {
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

export const initContributions: {[Id in InitHarnessId]: HarnessInitContribution<Id>} = {
  claude: claudeInit,
  codex: codexInit,
  'gemini-cli': geminiCliInit,
  opencode: opencodeInit,
  pi: piInit,
}
