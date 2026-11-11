import {execFile} from 'node:child_process'
import {existsSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {promisify} from 'node:util'
import {CLAUDE_AGENTS_IMPORT, CONCIV_SECTION_END, CONCIV_SECTION_START} from '@conciv/harness-init/agent-guide'

const run = promisify(execFile)

export type PreflightResult = {ok: true} | {ok: false; reason: string}

type TreeState = {kind: 'clean'} | {kind: 'dirty'} | {kind: 'no-repository'} | {kind: 'unreadable'; detail: string}

const NO_REPOSITORY = 'not a git repository'

const INIT_OWNED_FILES = ['AGENTS.md', 'CLAUDE.md']

const STATUS_COLUMNS = 'XY '.length

export async function preflight(cwd: string, force: boolean): Promise<PreflightResult> {
  if (!existsSync(join(cwd, 'package.json'))) {
    return {ok: false, reason: 'no package.json here — run init from your app directory'}
  }
  if (force) return {ok: true}
  const tree = await gitTreeState(cwd)
  if (tree.kind === 'dirty') return {ok: false, reason: 'uncommitted changes — commit first or pass --force'}
  if (tree.kind === 'unreadable') {
    return {ok: false, reason: `git status failed here (${tree.detail}) — fix it or pass --force`}
  }
  return {ok: true}
}

async function gitTreeState(cwd: string): Promise<TreeState> {
  try {
    const git = (args: string[]) => run('git', args, {cwd, env: {...process.env, LC_ALL: 'C'}})
    const status = await git(['status', '--porcelain', '-z', '--untracked-files=all'])
    const prefix = (await git(['rev-parse', '--show-prefix'])).stdout.trim()
    const changed = status.stdout.split('\0').filter((entry) => entry.length > 0)
    const owned = await Promise.all(
      changed.map((entry) => initOwned({cwd, prefix, path: entry.slice(STATUS_COLUMNS), git})),
    )
    return owned.every(Boolean) ? {kind: 'clean'} : {kind: 'dirty'}
  } catch (error) {
    const detail = gitFailureDetail(error)
    if (detail.toLowerCase().includes(NO_REPOSITORY)) return {kind: 'no-repository'}
    return {kind: 'unreadable', detail}
  }
}

async function initOwned(input: {
  cwd: string
  prefix: string
  path: string
  git: (args: string[]) => Promise<{stdout: string}>
}): Promise<boolean> {
  const name = INIT_OWNED_FILES.find((file) => `${input.prefix}${file}` === input.path)
  if (name === undefined) return false
  const current = await readFile(join(input.cwd, name), 'utf8').catch(() => '')
  const committed = await input.git(['show', `HEAD:${input.path}`]).then(
    (shown) => shown.stdout,
    () => '',
  )
  return withoutInitOutput(current) === withoutInitOutput(committed)
}

function withoutInitOutput(text: string): string {
  const start = text.indexOf(CONCIV_SECTION_START)
  const end = text.indexOf(CONCIV_SECTION_END)
  const sectioned = text.includes(CONCIV_SECTION_START) && end > start
  const unsectioned = sectioned ? `${text.slice(0, start)}${text.slice(end + CONCIV_SECTION_END.length)}` : text
  return unsectioned
    .split('\n')
    .filter((line) => line.trim() !== CLAUDE_AGENTS_IMPORT)
    .join('\n')
    .trim()
}

function gitFailureDetail(error: unknown): string {
  if (typeof error !== 'object' || error === null) return String(error)
  const stderr = 'stderr' in error ? error.stderr : undefined
  if (typeof stderr === 'string' && stderr.trim().length > 0) return firstLine(stderr)
  const message = 'message' in error ? error.message : undefined
  if (typeof message === 'string' && message.length > 0) return firstLine(message)
  return 'git could not be run'
}

function firstLine(text: string): string {
  return text.trim().split('\n')[0]?.trim() ?? ''
}
