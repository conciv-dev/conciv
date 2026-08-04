import {execFile} from 'node:child_process'
import {existsSync} from 'node:fs'
import {join} from 'node:path'
import {promisify} from 'node:util'

const run = promisify(execFile)

export type PreflightResult = {ok: true} | {ok: false; reason: string}

export async function preflight(cwd: string, force: boolean): Promise<PreflightResult> {
  if (!existsSync(join(cwd, 'package.json'))) {
    return {ok: false, reason: 'no package.json here — run init from your app directory'}
  }
  if (force) return {ok: true}
  const dirty = await gitTreeDirty(cwd)
  if (dirty) return {ok: false, reason: 'uncommitted changes — commit first or pass --force'}
  return {ok: true}
}

async function gitTreeDirty(cwd: string): Promise<boolean> {
  const status = await run('git', ['status', '--porcelain'], {cwd}).catch(() => ({stdout: ''}))
  return status.stdout.trim().length > 0
}
