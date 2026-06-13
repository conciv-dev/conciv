// Risk classifier for the PreToolUse gate: read-only commands run; anything else asks. Errs
// toward asking (shell composition or non-allowlisted commands need approval).

export type BashDecision = 'allow' | 'ask'

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
  if (c.startsWith('devgent tools') || c.startsWith('devgent ui')) return 'allow'
  // Shell composition (pipes, redirects, chaining, subshells) → ask.
  if (/[;&|`$><\n]/.test(c)) return 'ask'
  const tokens = c.split(/\s+/)
  if (tokens[0] === 'git') return GIT_READ_ONLY.has(tokens[1] ?? '') ? 'allow' : 'ask'
  return READ_ONLY.has(tokens[0] ?? '') ? 'allow' : 'ask'
}
