import {defineHarness, type HarnessAdapter, type HarnessLaunchContext} from '@conciv/protocol/harness-types'
import {CONCIV_PLUGIN_DIR} from './plugin-dir.js'
import {buildClaudeArgs, buildClaudeCompactArgs, claudeMcpArgs} from './args.js'
import {claudeToAguiEvents} from './decode.js'
import {claudeHistory} from './history.js'
import {claudeSdkRun, claudeSdkShutdown} from './sdk.js'

export {CHAT_SYSTEM_PROMPT} from './system-prompt.js'

const USE_SDK = !process.env.CONCIV_CLAUDE_CLI

const CLAUDE_MODELS = [
  {id: 'opus', name: 'Claude Opus 4.8', description: 'Most capable', group: 'Claude'},
  {id: 'sonnet', name: 'Claude Sonnet 4.6', description: 'Balanced speed + capability', group: 'Claude'},
  {id: 'haiku', name: 'Claude Haiku 4.5', description: 'Fastest', group: 'Claude'},
  {id: 'claude-fable-5', name: 'Fable 5', description: 'Disabled', group: 'Claude', disabled: true},
]

const claudeLaunch = (ctx: HarnessLaunchContext) => {
  const argv = ['claude']
  if (ctx.sessionId) argv.push('--resume', ctx.sessionId)
  if (ctx.model) argv.push('--model', ctx.model)
  if (ctx.mcpUrl) argv.push(...claudeMcpArgs(ctx.mcpUrl))
  if (CONCIV_PLUGIN_DIR) argv.push('--plugin-dir', CONCIV_PLUGIN_DIR)
  return ctx.openTerminal(argv)
}

const claudeBase = {
  id: 'claude',
  binName: 'claude',
  displayName: 'Claude',
  models: CLAUDE_MODELS,
  defaultModel: 'sonnet',
  buildArgs: buildClaudeArgs,
  decode: claudeToAguiEvents,
  history: claudeHistory,
  launch: claudeLaunch,
} as const

export function makeClaudeAdapter(useSdk: boolean): HarnessAdapter {
  if (useSdk) {
    return defineHarness({
      ...claudeBase,
      capabilities: {
        resume: true,
        permissionGate: 'callback',
        transcriptHistory: true,
        compaction: false,
        systemPrompt: 'flag',
        mcp: 'http',
        imageInput: 'fileRef',
      },
      run: claudeSdkRun,
      shutdown: claudeSdkShutdown,
    })
  }
  return defineHarness({
    ...claudeBase,
    capabilities: {
      resume: true,
      permissionGate: 'hook',
      transcriptHistory: true,
      compaction: true,
      systemPrompt: 'file',
      mcp: 'http',
      imageInput: 'fileRef',
    },
    buildCompactArgs: buildClaudeCompactArgs,
  })
}

export const claude = makeClaudeAdapter(USE_SDK)
