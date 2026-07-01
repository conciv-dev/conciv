import {defineHarness} from '@conciv/protocol/harness-types'
import {buildCodexArgs} from './args.js'
import {codexToAguiEvents} from './decode.js'

// codex proof adapter. Capabilities verified against the codex CLI docs: `exec --json` streams
// events, the sandbox governs risky ops (no HTTP gate → permissionGate:'none'), there is no
// system-prompt flag (systemPrompt:'none' → core prepends), `exec resume <id>` resumes, and no
// simple readable transcript is exposed (transcriptHistory:false).
export const codex = defineHarness({
  id: 'codex',
  binName: 'codex',
  displayName: 'Codex',
  capabilities: {
    resume: true,
    permissionGate: 'none',
    transcriptHistory: false,
    compaction: false,
    systemPrompt: 'none',
    mcp: 'http',
    imageInput: false,
  },
  buildArgs: buildCodexArgs,
  decode: codexToAguiEvents,
  // Interactive resume: codex [resume <id>] [-m <m>]. Model-only for v1 — codex has no --mcp-config
  // flag (MCP lives in ~/.codex/config.toml or -c overrides), so conciv tool parity is out of scope here.
  launch: (ctx) => {
    const argv = ['codex']
    if (ctx.sessionId) argv.push('resume', ctx.sessionId)
    if (ctx.model) argv.push('-m', ctx.model)
    return ctx.openTerminal(argv)
  },
})
