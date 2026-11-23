import {readFile} from 'node:fs/promises'
import {dirname, join, resolve} from 'node:path'
import {z} from 'zod'
import {Effect} from 'effect'
import type {Location} from '@conciv/plugin-host'
import type {Log} from '../lib/logging.js'

type VcsInfo = {provider?: string; branch: {current?: string}}

const AbsentFileSchema = z.object({code: z.enum(['ENOENT', 'ENOTDIR', 'EISDIR'])})

const HEAD_REF = 'ref: refs/heads/'

const BranchSchema = z
  .string()
  .trim()
  .startsWith(HEAD_REF)
  .transform((head) => head.slice(HEAD_REF.length))

const GITDIR = 'gitdir: '

const GitdirSchema = z
  .string()
  .trim()
  .startsWith(GITDIR)
  .transform((line) => line.slice(GITDIR.length))

export async function readVcs(vcs: Location.Interface['vcs'], log: Log): Promise<VcsInfo> {
  if (vcs === undefined) return {branch: {}}
  if (vcs.type !== 'git') return {provider: vcs.type, branch: {}}
  const head = (await readText(join(vcs.store, 'HEAD'), log)) ?? (await worktreeHead(vcs.store, log))
  const current = BranchSchema.safeParse(head).data
  return {provider: vcs.type, branch: current === undefined ? {} : {current}}
}

async function worktreeHead(store: string, log: Log): Promise<string | null> {
  const gitdir = GitdirSchema.safeParse(await readText(store, log))
  if (!gitdir.success) return null
  return readText(join(resolve(dirname(store), gitdir.data), 'HEAD'), log)
}

function readText(path: string, log: Log): Promise<string | null> {
  return readFile(path, 'utf8').catch((error: unknown) => {
    if (!AbsentFileSchema.safeParse(error).success) {
      log(Effect.logWarning('[core] reading a git file failed; vcs.get leaves the branch out', {path, error}))
    }
    return null
  })
}
