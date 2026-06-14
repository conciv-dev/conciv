import {readFileSync} from 'node:fs'

// Read a file's UTF-8 contents, or '' if it doesn't exist / can't be read.
export function readFileOrEmpty(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}
