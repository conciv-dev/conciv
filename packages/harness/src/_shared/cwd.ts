import {realpathSync} from 'node:fs'
import {resolve} from 'node:path'

export function realpathOrSelf(path: string): string {
  try {
    return realpathSync(resolve(path))
  } catch {
    return resolve(path)
  }
}

export function sameCwd(left: string, right: string): boolean {
  return realpathOrSelf(left) === realpathOrSelf(right)
}
