import type {HarnessTurn} from '@opendui/aidx-protocol/harness-types'

// Build the non-interactive `codex exec` argv: stream machine-readable JSON events to stdout and
// allow workspace edits without interactive approval (codex governs risky ops via its own
// sandbox, so aidx wires no permission gate). codex exec has no system-prompt flag, so the
// system prompt is prepended to the prompt upstream (systemPrompt:'none'); permissionUrl is
// ignored. A prior session resumes via the `exec resume <id>` subcommand.
export function buildCodexArgs(turn: HarnessTurn): string[] {
  const head = turn.resumeSessionId ? ['exec', 'resume', turn.resumeSessionId, turn.prompt] : ['exec', turn.prompt]
  const model = turn.model ? ['-m', turn.model] : []
  return [...head, ...model, '--json', '--sandbox', 'workspace-write']
}
