import {open} from 'node:fs/promises'

const HEAD_BYTES = 65_536
const NEWLINE = 0x0a

export async function readHead(path: string): Promise<string> {
  const file = await open(path, 'r')
  try {
    const head = Buffer.allocUnsafe(HEAD_BYTES)
    const {bytesRead} = await file.read(head, 0, HEAD_BYTES, null)
    const lastBreak = head.subarray(0, bytesRead).lastIndexOf(NEWLINE)
    return lastBreak < 0 ? '' : head.toString('utf8', 0, lastBreak + 1)
  } finally {
    await file.close()
  }
}
