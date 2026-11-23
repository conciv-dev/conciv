import {randomUUID} from 'node:crypto'
import {chmod, mkdir, rename, rm, writeFile} from 'node:fs/promises'
import {dirname} from 'node:path'

const FILE_MODE = 0o600

export async function writePrivateFile(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), {recursive: true})
  const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`
  try {
    await writeFile(tempPath, contents, {mode: FILE_MODE})
    await chmod(tempPath, FILE_MODE)
    await rename(tempPath, path)
  } catch (error) {
    await rm(tempPath, {force: true})
    throw error
  }
}
