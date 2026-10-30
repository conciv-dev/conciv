const READ_ONLY_COMMANDS = [
  'cd',
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
]

const GIT_READ_ONLY_SUBCOMMANDS = ['status', 'diff', 'log', 'show', 'branch']

export const readOnlyCommandAllows: readonly string[] = [
  ...READ_ONLY_COMMANDS.flatMap((command) => [command, `${command} *`]),
  ...GIT_READ_ONLY_SUBCOMMANDS.flatMap((subcommand) => [`git ${subcommand}`, `git ${subcommand} *`]),
]

const SHELL_METACHARACTER_ASKS = ['*;*', '*&*', '*|*', '*`*', '*$*', '*>*', '*<*']

const FIND_WRITE_OR_EXEC_FLAGS = [
  '-delete',
  '-exec',
  '-execdir',
  '-fls',
  '-fprint',
  '-fprint0',
  '-fprintf',
  '-ok',
  '-okdir',
]

const READ_ONLY_ESCAPE_FLAGS: Record<string, readonly string[]> = {
  find: FIND_WRITE_OR_EXEC_FLAGS,
  rg: ['--pre', '--hostname-bin'],
  grep: ['--filter', '--pager', '--view', '--save-config', '--config'],
  date: ['-s', '--set', '-f'],
  'git log': ['--output'],
  'git show': ['--output'],
  'git diff': ['--output'],
}

const GIT_BRANCH_WRITE_FLAGS = [
  '-d',
  '-D',
  '-m',
  '-M',
  '-c',
  '-C',
  '--delete',
  '--move',
  '--copy',
  '--set-upstream-to',
  '-u',
]

export const readOnlyCommandAsks: readonly string[] = [
  ...SHELL_METACHARACTER_ASKS,
  ...Object.entries(READ_ONLY_ESCAPE_FLAGS).flatMap(([command, flags]) => flags.map((flag) => `${command} *${flag}*`)),
  ...GIT_BRANCH_WRITE_FLAGS.map((flag) => `git branch *${flag}*`),
]
