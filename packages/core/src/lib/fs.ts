import {mkdirSync, writeFileSync} from 'node:fs'
import {dirname} from 'node:path'

export function writeText(path: string, text: string): void {
  mkdirSync(dirname(path), {recursive: true})
  writeFileSync(path, text)
}
