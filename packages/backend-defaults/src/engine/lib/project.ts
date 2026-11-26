import {readFile} from 'node:fs/promises'
import {dirname, join, resolve} from 'node:path'
import {z} from 'zod'
import type {Project} from '@conciv/protocol'

export type ProjectDeps = {readonly root: string; readonly instructions: string | null}

const PackageNameSchema = z.object({name: z.string()})

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

export async function readProject(deps: ProjectDeps): Promise<Project> {
  const [name, branch] = await Promise.all([projectName(deps.root), gitBranch(deps.root)])
  return {name, root: deps.root, branch, instructions: deps.instructions}
}

async function readText(path: string): Promise<string | null> {
  return readFile(path, 'utf8').catch((error: unknown) => {
    if (AbsentFileSchema.safeParse(error).success) return null
    throw error
  })
}

async function projectName(root: string): Promise<string | null> {
  const text = await readText(join(root, 'package.json'))
  if (text === null) return null
  try {
    return PackageNameSchema.safeParse(JSON.parse(text)).data?.name ?? null
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
}

async function gitBranch(directory: string): Promise<string | null> {
  const head = (await readText(join(directory, '.git', 'HEAD'))) ?? (await worktreeHead(directory))
  if (head !== null) return BranchSchema.safeParse(head).data ?? null
  const parent = dirname(directory)
  return parent === directory ? null : gitBranch(parent)
}

async function worktreeHead(root: string): Promise<string | null> {
  const gitdir = GitdirSchema.safeParse(await readText(join(root, '.git')))
  if (!gitdir.success) return null
  return readText(join(resolve(root, gitdir.data), 'HEAD'))
}
