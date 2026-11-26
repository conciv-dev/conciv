import {homedir} from 'node:os'
import type {ConfigProvider} from 'effect'
import {readOptionalConfig} from '../_shared/optional-config.js'
import {claudeInit} from '../init/claude/init.js'
import {claudeConfigDir} from '../init/claude/install-state.js'
import {defineHarness} from '../_shared/contract.js'
import {claudeSessionArgs, claudeConnectArgs} from './args.js'
import {claudeChatConfig} from './chat.js'
import {claudeHistory} from './history.js'
import {claudeSdkCommands, claudeSdkLogin, claudeSdkModels, type ClaudeProbeEnv} from './sdk.js'
import {definedEntries} from '../_shared/env.js'
import type {HarnessCommand, HarnessConnectContext} from '@conciv/types/harness-types'
import type {TtyCommand} from '@conciv/types/terminal-types'

const NESTED_SESSION_MARKERS = ['CLAUDECODE', 'CLAUDE_CODE_', 'CLAUDE_EFFORT', 'AI_AGENT']

export function claudeTtyCommand(ctx: HarnessConnectContext): TtyCommand {
  return {
    bin: 'claude',
    args: claudeConnectArgs(ctx),
    env: {TERM: 'xterm-256color', COLORTERM: 'truecolor'},
    unsetEnvPrefixes: NESTED_SESSION_MARKERS,
  }
}

const PROBE_ENV_NAMES = ['PATH', 'CLAUDE_CONFIG_DIR', 'ANTHROPIC_API_KEY']

function readProbeEnv(provider: ConfigProvider.ConfigProvider): ClaudeProbeEnv {
  const configured = Object.fromEntries(PROBE_ENV_NAMES.map((name) => [name, readOptionalConfig(provider, name)]))
  return {...process.env, ...definedEntries(configured)}
}

export function claude(provider: ConfigProvider.ConfigProvider) {
  const commandsByCwd = new Map<string, HarnessCommand[]>()
  const configDir = claudeConfigDir({home: homedir(), override: readOptionalConfig(provider, 'CLAUDE_CONFIG_DIR')})
  return defineHarness({
    id: 'claude',
    binName: 'claude',
    displayName: 'Claude',
    models: () => claudeSdkModels({env: readProbeEnv(provider)}),
    defaultModel: async () => 'opus',
    capabilities: {
      resume: true,
      permissionGate: 'callback',
      transcriptHistory: true,
      compaction: true,
      systemPrompt: 'file',
      mcp: 'http',
      slashCommands: 'live',
      imageInput: 'fileRef',
      init: 'files',
      login: 'probe',
    },
    init: claudeInit,
    chatConfig: claudeChatConfig,
    commands: (ctx) => claudeSdkCommands(ctx, readProbeEnv(provider), commandsByCwd),
    login: ({refresh}) => claudeSdkLogin({refresh: refresh ?? false, env: readProbeEnv(provider)}),
    history: claudeHistory(configDir),
    tty: {command: claudeTtyCommand},
    resume: {command: ({nativeId}) => ({bin: 'claude', args: claudeSessionArgs(nativeId, true)})},
  })
}
