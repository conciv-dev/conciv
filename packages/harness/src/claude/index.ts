import {defineHarness} from '@aidx/protocol/harness-types'
import {buildClaudeArgs, buildClaudeCompactArgs} from './args.js'
import {claudeToAguiEvents} from './decode.js'
import {claudeHistory} from './history.js'

// The claude-specific default chat prompt; core reads it as its fallback systemPrompt.
export {CHAT_SYSTEM_PROMPT} from './system-prompt.js'

// Models the claude CLI accepts via --model. Aliases (opus/sonnet/haiku) track the latest of each
// tier; the explicit Fable id is pinned. Listed newest-first within the Claude group.
const CLAUDE_MODELS = [
  {id: 'opus', name: 'Claude Opus 4.8', description: 'Most capable', group: 'Claude'},
  {id: 'sonnet', name: 'Claude Sonnet 4.6', description: 'Balanced speed + capability', group: 'Claude'},
  {id: 'haiku', name: 'Claude Haiku 4.5', description: 'Fastest', group: 'Claude'},
  {id: 'claude-fable-5', name: 'Fable 5', description: 'Disabled', group: 'Claude', disabled: true},
]

// The claude HarnessAdapter. systemPrompt is delivered as a file (turn.systemPrompt is the path
// the chat route wrote).
export const claude = defineHarness({
  id: 'claude',
  binName: 'claude',
  capabilities: {
    resume: true,
    permissionGate: 'hook',
    transcriptHistory: true,
    compaction: true,
    systemPrompt: 'file',
    mcp: 'http',
    imageInput: 'fileRef',
  },
  models: CLAUDE_MODELS,
  defaultModel: 'sonnet',
  buildArgs: buildClaudeArgs,
  buildCompactArgs: buildClaudeCompactArgs,
  decode: claudeToAguiEvents,
  history: claudeHistory,
})
