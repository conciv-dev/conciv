const TOLERATED_STDERR_REDIRECT = /(?<=\s)2>\/dev\/null(?=\s|$)/g
const PLAIN_CHARACTERS = /^[A-Za-z0-9_@%+=:,./ *?|;&-]*$/
const SEPARATORS = /(&&|\|\||[|;&])/
const JOINERS = new Set(['&&', '|', ';'])
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

const RIPGREP_EXEC_FLAGS = new Set(['--pre', '--hostname-bin'])
const GREP_EXEC_OR_WRITE_FLAGS = new Set(['--filter', '--pager', '--view', '--save-config', '--config'])
const DATE_CLOCK_FLAGS = new Set(['-s', '--set', '-f'])
const GIT_FILE_OUTPUT_FLAGS = new Set(['--output'])

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

function flagName(token: string): string {
  const assignment = token.indexOf('=')
  return assignment === -1 ? token : token.slice(0, assignment)
}

function carriesFlag(tokens: readonly string[], flags: ReadonlySet<string>): boolean {
  return tokens.some((token) => flags.has(flagName(token)))
}

function listsBranchesOnly(tokens: readonly string[]): boolean {
  return tokens.every((token) => GIT_BRANCH_LIST_FLAGS.has(token) || token.startsWith('--sort='))
}

function writesOutsideGitReads(tokens: readonly string[]): boolean {
  if (carriesFlag(tokens, GIT_FILE_OUTPUT_FLAGS)) return true
  return tokens[1] === 'branch' && !listsBranchesOnly(tokens.slice(2))
}

function loadsGrepOptionsFromFile(tokens: readonly string[]): boolean {
  return tokens.some((token) => token.startsWith('---'))
}

function readsClockOnly(tokens: readonly string[]): boolean {
  if (carriesFlag(tokens, DATE_CLOCK_FLAGS)) return false
  return tokens.every((token) => token.startsWith('+') || token.startsWith('-'))
}

const READ_ONLY_ESCAPES: ReadonlyMap<string, (tokens: readonly string[]) => boolean> = new Map([
  ['env', (tokens: readonly string[]) => tokens.length > 1],
  ['find', (tokens: readonly string[]) => tokens.some((token) => FIND_WRITE_ACTIONS.has(token))],
  ['rg', (tokens: readonly string[]) => carriesFlag(tokens, RIPGREP_EXEC_FLAGS)],
  [
    'grep',
    (tokens: readonly string[]) => carriesFlag(tokens, GREP_EXEC_OR_WRITE_FLAGS) || loadsGrepOptionsFromFile(tokens),
  ],
  ['date', (tokens: readonly string[]) => !readsClockOnly(tokens.slice(1))],
  ['git', writesOutsideGitReads],
])

export function escapesReadOnlyIntent(segment: string): boolean {
  const tokens = tokensOf(segment)
  const head = tokens[0]
  if (head === undefined) return true
  return READ_ONLY_ESCAPES.get(head)?.(tokens) ?? false
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
