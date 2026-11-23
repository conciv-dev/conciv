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

export function onPath(path: string, bin: string): boolean {
  const directories = path.split(delimiter).filter((entry) => entry.length > 0)
  return directories.some((directory) => executable(join(directory, bin)))
}
