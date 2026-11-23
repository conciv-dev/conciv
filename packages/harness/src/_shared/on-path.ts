import {accessSync, constants} from 'node:fs'
import {delimiter, join} from 'node:path'

function executable(file: string): boolean {
  try {
    accessSync(file, constants.X_OK)
    return true
  } catch {
    return false
  }
}

export function onPath(path: string, bin: string, cwd: string): boolean {
  const directories = path.split(delimiter).map((entry) => (entry.length > 0 ? entry : cwd))
  return directories.some((directory) => executable(join(directory, bin)))
}
