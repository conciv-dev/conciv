export type ClaudeArgsOptions = {
  prompt: string
  cwd: string
  resumeSessionId: string | null
  appendSystemPromptFile?: string
  permissionUrl?: string // when set, a PreToolUse http hook gates risky Bash to this URL
}

// PreToolUse http hook on Bash → the dev server's permission route. 600s (route denies sooner).
function hookSettings(permissionUrl: string): string {
  return JSON.stringify({
    hooks: {
      PreToolUse: [{matcher: 'Bash', hooks: [{type: 'http', url: permissionUrl, timeout: 600}]}],
    },
  })
}

// The headless `claude -p` argv: stream-json, acceptEdits (git is the undo net), cwd allowed.
export function buildClaudeArgs(o: ClaudeArgsOptions): string[] {
  const args = [
    '-p',
    o.prompt,
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
    o.cwd,
  ]
  if (o.permissionUrl) args.push('--settings', hookSettings(o.permissionUrl))
  if (o.appendSystemPromptFile) args.push('--append-system-prompt-file', o.appendSystemPromptFile)
  if (o.resumeSessionId) args.push('--resume', o.resumeSessionId)
  return args
}
