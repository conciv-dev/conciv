export type ChatClaudeOptions = {
  prompt: string
  cwd: string
  resumeSessionId: string | null
  appendSystemPromptFile?: string
  // When set, register a PreToolUse http hook (via --settings) that POSTs each Bash tool to
  // this URL for an allow/deny decision — the risky-op gate. Omitted → no gate.
  permissionUrl?: string
}

// The PreToolUse hook settings injected via --settings: an http hook on Bash that defers the
// decision to the dev server's /__pw/chat/permission route. 600s timeout (the route itself
// auto-denies sooner) so a real user approval has time to land.
function hookSettings(permissionUrl: string): string {
  return JSON.stringify({
    hooks: {
      PreToolUse: [{matcher: 'Bash', hooks: [{type: 'http', url: permissionUrl, timeout: 600}]}],
    },
  })
}

// Build the headless `claude -p` argv for a chat turn: streaming JSON, auto-accept edits
// (git is the undo net), and the working tree as an allowed dir. --resume continues a
// prior session when one is supplied (the agent's or the chat's own).
export function buildChatClaudeArgs(o: ChatClaudeOptions): string[] {
  const args = [
    '-p',
    o.prompt,
    '--output-format',
    'stream-json',
    '--verbose',
    '--permission-mode',
    'acceptEdits',
    // acceptEdits auto-accepts file edits but Bash still prompts — and there's no one to
    // approve in headless -p. Allow the agent's own `devgent tools` (page/vite access) and
    // `devgent ui` (render generative UI in the chat) CLIs to run without approval; everything
    // else still gates.
    '--allowedTools',
    'Bash(devgent tools:*)',
    'Bash(devgent ui:*)',
    '--add-dir',
    o.cwd,
  ]
  if (o.permissionUrl) args.push('--settings', hookSettings(o.permissionUrl))
  if (o.appendSystemPromptFile) args.push('--append-system-prompt-file', o.appendSystemPromptFile)
  if (o.resumeSessionId) args.push('--resume', o.resumeSessionId)
  return args
}
