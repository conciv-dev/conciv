import {
  defineHarness,
  defineHarnessArgs,
  defineHarnessDecoder,
  type HarnessTurn,
} from '@devgent/protocol/harness-types'
import {buildClaudeArgs} from './args.js'
import {claudeToAguiEvents} from './decode.js'
import {claudeHistory} from './history.js'

// The inline claude HarnessAdapter. Claude supports --resume, a PreToolUse http permission
// hook, on-disk JSONL transcript history, and an --append-system-prompt-FILE. The system
// prompt is delivered as a file the core chat route writes once per boot, so buildArgs reads
// the path from turn.systemPrompt (the prompt-file path the route prepared).
//
// Every member is authored through its protocol define* factory (defineHarnessArgs /
// defineHarnessDecoder / defineHarnessHistory via claudeHistory) and the whole adapter through
// defineHarness — never a bare object literal. defineHarness dev-asserts the capability
// invariant: transcriptHistory ⇒ history (provided below).

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
