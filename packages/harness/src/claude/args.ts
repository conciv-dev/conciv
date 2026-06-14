import type {HarnessTurn} from '@aidx/protocol/harness-types'

// PreToolUse http hook on Bash → the dev server's permission route. 600s (route denies sooner).
function hookSettings(permissionUrl: string): string {
  return JSON.stringify({
    hooks: {
      PreToolUse: [{matcher: 'Bash', hooks: [{type: 'http', url: permissionUrl, timeout: 600}]}],
    },
  })
}

// The headless `claude -p` argv: stream-json, acceptEdits (git is the undo net), cwd allowed.
// systemPrompt is delivered as a file — turn.systemPrompt is the path the chat route wrote.
export function buildClaudeArgs(turn: HarnessTurn): string[] {
  const args = [
    '-p',
    turn.prompt,
    '--output-format',
    'stream-json',
    '--verbose',
    '--permission-mode',
    'acceptEdits',
    // Let the agent's own CLIs run unprompted; all other Bash still gates.
    '--allowedTools',
    'Bash(aidx tools:*)',
    'Bash(aidx ui:*)',
    '--add-dir',
    turn.cwd,
  ]
  if (turn.permissionUrl) args.push('--settings', hookSettings(turn.permissionUrl))
  if (turn.systemPrompt) args.push('--append-system-prompt-file', turn.systemPrompt)
  if (turn.resumeSessionId) args.push('--resume', turn.resumeSessionId)
  return args
}
