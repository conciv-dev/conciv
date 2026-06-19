import {defineHarness, type HarnessAdapter, type HarnessLaunchContext} from '@mandarax/protocol/harness-types'
import {MANDARAX_PLUGIN_DIR} from './plugin-dir.js'
import {buildClaudeArgs, buildClaudeCompactArgs, claudeMcpArgs} from './args.js'
import {claudeToAguiEvents} from './decode.js'
import {claudeHistory} from './history.js'
import {claudeSdkRun, claudeSdkShutdown} from './sdk.js'

// The claude-specific default chat prompt; core reads it as its fallback systemPrompt.
export {CHAT_SYSTEM_PROMPT} from './system-prompt.js'

// MANDARAX_CLAUDE_SDK → in-process Agent SDK transport (warm process per session); unset → spawn path.
const USE_SDK = !!process.env.MANDARAX_CLAUDE_SDK

// Models the claude CLI accepts via --model. Aliases (opus/sonnet/haiku) track the latest of each
// tier; the explicit Fable id is pinned. Listed newest-first within the Claude group.
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
  if (MANDARAX_PLUGIN_DIR) argv.push('--plugin-dir', MANDARAX_PLUGIN_DIR)
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

export const claude: HarnessAdapter = USE_SDK
  ? defineHarness({
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
  : defineHarness({
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
