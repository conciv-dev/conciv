import {execFile} from 'node:child_process'
import {existsSync} from 'node:fs'
import {join} from 'node:path'
import {promisify} from 'node:util'

const run = promisify(execFile)

export type PreflightResult = {ok: true} | {ok: false; reason: string}

type TreeState = {kind: 'clean'} | {kind: 'dirty'} | {kind: 'no-repository'} | {kind: 'unreadable'; detail: string}

const NO_REPOSITORY = 'not a git repository'

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
    const status = await run('git', ['status', '--porcelain'], {cwd, env: {...process.env, LC_ALL: 'C'}})
    return status.stdout.trim().length > 0 ? {kind: 'dirty'} : {kind: 'clean'}
  } catch (error) {
    const detail = gitFailureDetail(error)
    if (detail.toLowerCase().includes(NO_REPOSITORY)) return {kind: 'no-repository'}
    return {kind: 'unreadable', detail}
  }
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
