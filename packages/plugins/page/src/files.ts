export * as PageFiles from './files.js'
import {randomUUID} from 'node:crypto'
import {mkdir, writeFile} from 'node:fs/promises'
import {extname, join} from 'node:path'
import {Data, Effect} from 'effect'
import {z} from 'zod'
import {CONCIV_STATE_DIR} from '@conciv/protocol/state-types'
import {Tool} from '@conciv/plugin/schema/tool'
import {MAX_FILE_BYTES, type File} from './rpc.js'

const Coded = z.object({code: z.string()})

const SCREENSHOTS = join(CONCIV_STATE_DIR, 'tmp', 'screenshots')

const TransferTooLarge = Data.TaggedError('PageFilesTransferTooLarge')<{readonly message: string}>
const WriteFailed = Data.TaggedError('PageFilesWriteFailed')<{readonly cause: unknown}>

type SaveFailure = InstanceType<typeof TransferTooLarge> | InstanceType<typeof WriteFailed>

export function save(files: readonly File[], root: string) {
  return saving(files, root).pipe(Effect.mapError(failure))
}

function saving(files: readonly File[], root: string) {
  return Effect.gen(function* () {
    if (files.length === 0) return []
    if (files.reduce((size, file) => size + file.data.byteLength, 0) > MAX_FILE_BYTES)
      return yield* new TransferTooLarge({
        message:
          'Capture files exceed the 5 MiB total transfer limit. Use a smaller screenshot or a smaller page; do not retry the identical capture.',
      })
    yield* Effect.tryPromise({
      try: () => mkdir(join(root, SCREENSHOTS), {recursive: true}),
      catch: (cause) => new WriteFailed({cause}),
    })
    return yield* Effect.forEach(
      files,
      (file) => {
        const path = join(SCREENSHOTS, `${randomUUID()}${extname(captureName(file.name))}`)
        return Effect.tryPromise({
          try: () => writeFile(join(root, path), file.data, {flag: 'wx'}),
          catch: (cause) => new WriteFailed({cause}),
        }).pipe(Effect.as({id: file.id, name: file.name, mime: file.mime, bytes: file.data.byteLength, path}))
      },
      {concurrency: 'unbounded'},
    )
  })
}

function captureName(name: string) {
  const sanitized = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-160)
  if (!sanitized || /^\.{1,2}$/.test(sanitized) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(sanitized))
    return 'capture'
  return sanitized
}

function failure(error: SaveFailure) {
  const cause = error instanceof WriteFailed ? error.cause : error
  const detail = cause instanceof Error ? cause.message.slice(0, 400) : String(cause).slice(0, 400)
  const coded = Coded.safeParse(cause)
  const code = coded.success && !detail.startsWith(coded.data.code) ? `${coded.data.code}: ` : ''
  return Tool.toolError({
    message: `Cannot save page files on the server. The page may have completed the capture, but no server-local file is confirmed. Check free space and write access on the server, then take the capture again. Details: ${code}${detail}`,
    error: cause,
  })
}
