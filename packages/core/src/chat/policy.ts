export type CommandPolicy = 'allow' | 'ask'

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

const GIT_READ_ONLY = new Set(['status', 'diff', 'log', 'show', 'branch'])

export function classifyCommand(command: string): CommandPolicy {
  const c = command.trim()
  if (c === '') return 'ask'

  if (/[;&|`$><\n]/.test(c)) return 'ask'
  if (c.startsWith('conciv tools')) return 'allow'
  const tokens = c.split(/\s+/)
  if (tokens[0] === 'git') return GIT_READ_ONLY.has(tokens[1] ?? '') ? 'allow' : 'ask'
  return READ_ONLY.has(tokens[0] ?? '') ? 'allow' : 'ask'
}
