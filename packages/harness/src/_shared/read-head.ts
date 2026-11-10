import {closeSync, openSync, readSync} from 'node:fs'

const HEAD_BYTES = 65_536
const NEWLINE = 0x0a

export function readHead(path: string): string {
  const file = openSync(path, 'r')
  try {
    const head = Buffer.allocUnsafe(HEAD_BYTES)
    const bytesRead = readSync(file, head, 0, HEAD_BYTES, null)
    const lastBreak = head.subarray(0, bytesRead).lastIndexOf(NEWLINE)
    return lastBreak < 0 ? '' : head.toString('utf8', 0, lastBreak + 1)
  } finally {
    closeSync(file)
  }
}
