import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {dirname} from 'node:path'

export function readFileOrEmpty(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

export function writeText(path: string, text: string): void {
  mkdirSync(dirname(path), {recursive: true})
  writeFileSync(path, text)
}
