const TOLERATED_STDERR_REDIRECT = /(?<=\s)2>\/dev\/null(?=\s|$)/g
const PLAIN_CHARACTERS = /^[A-Za-z0-9_@%+=:,./ *?|;&-]*$/
const SEPARATORS = /(&&|\|\||[|;&])/
const JOINERS = new Set(['&&', '|', ';'])
const COMMAND_RUNNER_HEADS = new Set(['env'])
const FIND_WRITE_ACTIONS = new Set([
  '-delete',
  '-exec',
  '-execdir',
  '-fls',
  '-fprint',
  '-fprint0',
  '-fprintf',
  '-ok',
  '-okdir',
])

const GIT_BRANCH_LIST_FLAGS = new Set([
  '-a',
  '-l',
  '-r',
  '-v',
  '-vv',
  '--list',
  '--show-current',
  '--merged',
  '--no-merged',
  '--contains',
])

function tokensOf(segment: string): string[] {
  return segment.split(' ').filter((token) => token.length > 0)
}

function listsBranchesOnly(tokens: readonly string[]): boolean {
  return tokens.every((token) => GIT_BRANCH_LIST_FLAGS.has(token) || token.startsWith('--sort='))
}

export function writesDespiteReadOnlySubcommand(segment: string): boolean {
  const tokens = tokensOf(segment)
  if (tokens[0] !== 'git') return false
  if (tokens.some((token) => token === '--output' || token.startsWith('--output='))) return true
  return tokens[1] === 'branch' && !listsBranchesOnly(tokens.slice(2))
}

export function runsAnotherCommand(segment: string): boolean {
  const tokens = tokensOf(segment)
  const head = tokens[0]
  if (head === undefined) return true
  if (COMMAND_RUNNER_HEADS.has(head)) return tokens.length > 1
  if (head === 'find') return tokens.some((token) => FIND_WRITE_ACTIONS.has(token))
  return false
}

export function commandSegments(command: string): string[] | null {
  const scanned = command.replace(TOLERATED_STDERR_REDIRECT, '')
  if (!PLAIN_CHARACTERS.test(scanned)) return null
  const parts = scanned.split(SEPARATORS)
  const joinedCorrectly = parts.every((part, index) => index % 2 === 0 || JOINERS.has(part))
  if (!joinedCorrectly) return null
  const segments = parts.filter((_, index) => index % 2 === 0).map((segment) => segment.trim())
  if (segments.some((segment) => segment.length === 0)) return null
  return segments
}

export function rememberableCommand(command: string): string | null {
  if (commandSegments(command) === null) return null
  return command.trim().replace(/\s+/g, ' ')
}
