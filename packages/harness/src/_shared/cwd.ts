import {realpathSync} from 'node:fs'
import {isAbsolute, relative, resolve} from 'node:path'

export function inside(parent: string, child: string): boolean {
  const step = relative(parent, child)
  return step.length > 0 && !step.startsWith('..') && !isAbsolute(step)
}

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
