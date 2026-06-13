import {defineHarness, defineHarnessArgs, defineHarnessDecoder, type HarnessTurn} from '@devgent/protocol/harness-types'
import {buildClaudeArgs} from './args.js'
import {claudeToAguiEvents} from './decode.js'
import {claudeHistory} from './history.js'

// The inline claude HarnessAdapter. systemPrompt is delivered as a file (turn.systemPrompt is
// the path the chat route wrote). Each member uses its define* factory.

const buildArgs = defineHarnessArgs((turn: HarnessTurn) =>
  buildClaudeArgs({
    prompt: turn.prompt,
    cwd: turn.cwd,
    resumeSessionId: turn.resumeSessionId,
    appendSystemPromptFile: turn.systemPrompt || undefined,
    permissionUrl: turn.permissionUrl,
  }),
)

const decode = defineHarnessDecoder(claudeToAguiEvents)

export const claudeAdapter = defineHarness({
  id: 'claude',
  binName: 'claude',
  capabilities: {resume: true, permissionGate: 'hook', transcriptHistory: true, systemPrompt: 'file'},
  buildArgs,
  decode,
  history: claudeHistory,
})
