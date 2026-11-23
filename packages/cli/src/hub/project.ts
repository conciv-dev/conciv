import {readFile} from 'node:fs/promises'
import {dirname, join, resolve} from 'node:path'
import {z} from 'zod'

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

function readText(path: string): Promise<string | null> {
  return readFile(path, 'utf8').catch((error: unknown) => {
    if (!AbsentFileSchema.safeParse(error).success) {
      process.stderr.write(
        `conciv: reading ${path} failed; the tab listing leaves it out: ${error instanceof Error ? error.message : String(error)}\n`,
      )
    }
    return null
  })
}

export async function projectName(root: string): Promise<string | null> {
  const text = await readText(join(root, 'package.json'))
  if (text === null) return null
  return PackageNameSchema.safeParse(parseJson(text)).data?.name ?? null
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
}

export async function currentBranch(directory: string): Promise<string | null> {
  const head = await headAt(directory)
  if (head !== null) return BranchSchema.safeParse(head).data ?? null
  const parent = dirname(directory)
  return parent === directory ? null : currentBranch(parent)
}

async function headAt(directory: string): Promise<string | null> {
  return (await readText(join(directory, '.git', 'HEAD'))) ?? worktreeHead(directory)
}

async function worktreeHead(root: string): Promise<string | null> {
  const gitdir = GitdirSchema.safeParse(await readText(join(root, '.git')))
  if (!gitdir.success) return null
  return readText(join(resolve(root, gitdir.data), 'HEAD'))
}
