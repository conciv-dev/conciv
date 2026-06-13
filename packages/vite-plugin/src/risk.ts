// Risk classifier for the PreToolUse gate. The chat agent runs headless, so it can't get
// an interactive permission prompt — without this, any Bash beyond the allowlisted `devgent`
// CLIs is simply denied, so the agent can't run tests/installs/git. The gate lets risky
// commands run WITH the user's approval (surfaced as a confirm card in the chat). We err
// toward asking: anything with shell composition, or any command not on the read-only
// allowlist, requires approval.

export type BashDecision = 'allow' | 'ask'

// Single commands that only read state — safe to run without asking.
const READ_ONLY = new Set([
  'ls',
  'cat',
  'pwd',
  'echo',
  'head',
  'tail',
  'grep',
  'rg',
  'find',
  'which',
  'wc',
  'env',
  'date',
  'true',
])

// git subcommands that don't mutate the repo.
const GIT_READ_ONLY = new Set(['status', 'diff', 'log', 'show', 'branch'])

export function bashDecision(command: string): BashDecision {
  const c = command.trim()
  if (c === '') return 'ask'
  // The agent's own CLIs are always safe (and already allowlisted via --allowedTools).
  if (c.startsWith('devgent tools') || c.startsWith('devgent ui')) return 'allow'
  // Any shell composition (pipes, redirects, chaining, subshells) → ask. We can't reason
  // about the full command, so we don't try.
  if (/[;&|`$><\n]/.test(c)) return 'ask'
  const tokens = c.split(/\s+/)
  if (tokens[0] === 'git') return GIT_READ_ONLY.has(tokens[1] ?? '') ? 'allow' : 'ask'
  return READ_ONLY.has(tokens[0] ?? '') ? 'allow' : 'ask'
}
