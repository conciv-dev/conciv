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
