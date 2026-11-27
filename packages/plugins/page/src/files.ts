export * as PageFiles from './files.js'
import {randomUUID} from 'node:crypto'
import {mkdir, writeFile} from 'node:fs/promises'
import {extname, join} from 'node:path'
import {Effect} from 'effect'
import type {EvlogError} from 'evlog'
import {z} from 'zod'
import {CONCIV_STATE_DIR} from '@conciv/types/state-types'
import * as Tool from '@conciv/protocol/schema/tool'
import {MAX_FILE_BYTES, type File} from './rpc.js'
import {pageErrors} from './errors/errors.js'

const Coded = z.object({code: z.string()})

const SCREENSHOTS = join(CONCIV_STATE_DIR, 'tmp', 'screenshots')

export function save(files: readonly File[], root: string) {
  return saving(files, root).pipe(Effect.mapError(failure))
}

function saving(files: readonly File[], root: string) {
  return Effect.gen(function* () {
    if (files.length === 0) return []
    if (files.reduce((size, file) => size + file.data.byteLength, 0) > MAX_FILE_BYTES)
      return yield* Effect.fail(pageErrors.FILES_TOO_LARGE())
    yield* Effect.tryPromise({
      try: () => mkdir(join(root, SCREENSHOTS), {recursive: true}),
      catch: notSaved,
    })
    return yield* Effect.forEach(
      files,
      (file) => {
        const path = join(SCREENSHOTS, `${randomUUID()}${extname(captureName(file.name))}`)
        return Effect.tryPromise({
          try: () => writeFile(join(root, path), file.data, {flag: 'wx'}),
          catch: notSaved,
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

function notSaved(cause: unknown) {
  return pageErrors.FILES_NOT_SAVED({cause: cause instanceof Error ? cause : undefined})
}

function failure(error: EvlogError) {
  const advice = [error.message, error.why, error.fix].filter(Boolean).join(' ')
  if (error.code !== pageErrors.FILES_NOT_SAVED.code) return Tool.toolError({message: advice, error})
  const cause = error.cause
  const detail = cause instanceof Error ? cause.message.slice(0, 400) : String(cause).slice(0, 400)
  const coded = Coded.safeParse(cause)
  const code = coded.success && !detail.startsWith(coded.data.code) ? `${coded.data.code}: ` : ''
  return Tool.toolError({message: `${advice} Details: ${code}${detail}`, error: cause})
}
