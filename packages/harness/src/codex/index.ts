import {defineHarness} from '@aidx/protocol/harness-types'
import {buildCodexArgs} from './args.js'
import {codexToAguiEvents} from './decode.js'

// codex proof adapter. Capabilities verified against the codex CLI docs: `exec --json` streams
// events, the sandbox governs risky ops (no HTTP gate → permissionGate:'none'), there is no
// system-prompt flag (systemPrompt:'none' → core prepends), `exec resume <id>` resumes, and no
// simple readable transcript is exposed (transcriptHistory:false).
export const codex = defineHarness({
  id: 'codex',
  binName: 'codex',
  capabilities: {resume: true, permissionGate: 'none', transcriptHistory: false, systemPrompt: 'none'},
  buildArgs: buildCodexArgs,
  decode: codexToAguiEvents,
})
