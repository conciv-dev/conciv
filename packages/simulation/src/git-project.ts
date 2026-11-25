import {execFile} from 'node:child_process'
import {appendFile} from 'node:fs/promises'
import {join} from 'node:path'
import {promisify} from 'node:util'

const run = promisify(execFile)

const REPOSITORY_CONFIG = `[core]
	fsmonitor = false
[commit]
	gpgsign = false
[user]
	email = test@conciv.test
	name = Test
`

function git(project: string, ...args: string[]): Promise<unknown> {
  return run('git', args, {
    cwd: project,
    env: {...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1'},
  })
}

export async function initGitProject(project: string): Promise<void> {
  await git(project, 'init', '--initial-branch', 'main')
  await appendFile(join(project, '.git', 'config'), REPOSITORY_CONFIG)
  await appendFile(join(project, '.git', 'info', 'exclude'), '.conciv/\n')
  await git(project, 'commit', '--allow-empty', '-m', 'initial')
}

export async function commitAll(project: string, message: string): Promise<void> {
  await git(project, 'add', '-A')
  await git(project, 'commit', '-m', message)
}
