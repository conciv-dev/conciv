import {mkdir, mkdtemp, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {z} from 'zod'
import {Tool} from '@conciv/plugin'
import {raise} from './connection.js'
import {MAX_FILE_BYTES, type File} from './rpc.js'

const Coded = z.object({code: z.string()})

export async function save(files: readonly File[]) {
  if (files.length === 0) return []
  try {
    if (files.reduce((size, file) => size + file.data.byteLength, 0) > MAX_FILE_BYTES)
      throw new Error(
        'Capture files exceed the 5 MiB total transfer limit. Use a smaller screenshot or a smaller page; do not retry the identical capture.',
      )
    const directory = await mkdtemp(join(tmpdir(), 'conciv-page-'))
    return await Promise.all(
      files.map(async (file, index) => {
        const name = captureName(file.name)
        await mkdir(join(directory, String(index)))
        const path = join(directory, String(index), name)
        await writeFile(path, file.data, {flag: 'wx'})
        return {id: file.id, name: file.name, mime: file.mime, bytes: file.data.byteLength, path}
      }),
    )
  } catch (error) {
    throw raise(failure(error))
  }
}

function captureName(name: string) {
  const sanitized = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-160)
  if (!sanitized || /^\.{1,2}$/.test(sanitized) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(sanitized))
    return 'capture'
  return sanitized
}

function failure(error: unknown) {
  const detail = error instanceof Error ? error.message.slice(0, 400) : String(error).slice(0, 400)
  const coded = Coded.safeParse(error)
  const code = coded.success && !detail.startsWith(coded.data.code) ? `${coded.data.code}: ` : ''
  return Tool.toolError({
    message: `Cannot save page files on the server. The page may have completed the capture, but no server-local file is confirmed. Check free space and write access on the server, then take the capture again. Details: ${code}${detail}`,
    error,
  })
}
