import {mkdir, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {z} from 'zod'

export const CONCIV_STATE_DIR = '.conciv'

export function concivStateDir(root: string): string {
  return join(root, CONCIV_STATE_DIR)
}

const CONCIV_STATE_GITIGNORE = ['*', '!.gitignore', '!settings/', '!settings/**', ''].join('\n')

const ExistingFileErrorSchema = z.object({code: z.literal('EEXIST')})

export async function createConcivStateDir(stateDir: string): Promise<string> {
  await mkdir(stateDir, {recursive: true})
  const ignoreFile = join(stateDir, '.gitignore')
  try {
    await writeFile(ignoreFile, CONCIV_STATE_GITIGNORE, {flag: 'wx'})
  } catch (error) {
    if (!ExistingFileErrorSchema.safeParse(error).success)
      throw new Error(`conciv: could not write ${ignoreFile}`, {cause: error})
  }
  return stateDir
}
