import {defineHarness} from '@aidx/protocol/harness-types'
import {buildClaudeArgs} from './args.js'
import {claudeToAguiEvents} from './decode.js'
import {claudeHistory} from './history.js'

// The claude-specific default chat prompt; core reads it as its fallback systemPrompt.
export {CHAT_SYSTEM_PROMPT} from './system-prompt.js'

// The claude HarnessAdapter. systemPrompt is delivered as a file (turn.systemPrompt is the path
// the chat route wrote).
export const claude = defineHarness({
  id: 'claude',
  binName: 'claude',
  capabilities: {
    resume: true,
    permissionGate: 'hook',
    transcriptHistory: true,
    systemPrompt: 'file',
    mcp: 'http',
    imageInput: 'fileRef',
  },
  buildArgs: buildClaudeArgs,
  decode: claudeToAguiEvents,
  history: claudeHistory,
})
