import {isAbsolute, resolve, sep} from 'node:path'
import {existsSync} from 'node:fs'
import launchEditor from 'launch-editor'

const within = (root: string, p: string): boolean => p === root || p.startsWith(root + sep)

export function makeOpenInEditor(root: string) {
  return (file: string, line: number): void => {
    if (isAbsolute(file) && existsSync(file)) return void launchEditor(`${file}:${line}`)
    const abs = resolve(root, file.replace(/^\/+/, ''))
    if (within(root, abs)) launchEditor(`${abs}:${line}`)
  }
}
