import {isAbsolute, resolve, sep} from 'node:path'
import {access} from 'node:fs/promises'
import launchEditor from 'launch-editor'

const exists = (file: string): Promise<boolean> =>
  access(file).then(
    () => true,
    () => false,
  )

const within = (root: string, p: string): boolean => p === root || p.startsWith(root + sep)

export function makeOpenInEditor(root: string) {
  return async (file: string, line: number, column?: number): Promise<void> => {
    const position = column === undefined ? `${line}` : `${line}:${column}`
    if (isAbsolute(file) && (await exists(file))) return void launchEditor(`${file}:${position}`)
    const abs = resolve(root, file.replace(/^\/+/, ''))
    if (within(root, abs)) launchEditor(`${abs}:${position}`)
  }
}
