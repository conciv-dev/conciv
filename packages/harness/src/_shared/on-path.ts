import {constants} from 'node:fs'
import {access} from 'node:fs/promises'
import {delimiter, join, resolve} from 'node:path'

async function executable(file: string): Promise<boolean> {
  return access(file, constants.X_OK).then(
    () => true,
    () => false,
  )
}

export async function onPath(path: string, bin: string, cwd: string): Promise<boolean> {
  const directories = path.split(delimiter).map((entry) => resolve(cwd, entry))
  const found = await Promise.all(directories.map((directory) => executable(join(directory, bin))))
  return found.includes(true)
}
