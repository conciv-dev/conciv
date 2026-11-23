import {readFile, realpath} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {resolve, sep} from 'node:path'
import {AnyMap, originalPositionFor, type TraceMap} from '@jridgewell/trace-mapping'
import {Cache, Duration, Effect, Exit} from 'effect'
import type {RawFrame, SourceLoc} from '@conciv/contract'

const SERVER_PREFIX = /^about:\/\/React\/Server\//
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
const SOURCE_FETCH_TIMEOUT_MS = 5000
const SOURCE_MAP_CAPACITY = 64
const SOURCE_MAP_TIME_TO_LIVE = Duration.seconds(30)

function normalizeUrl(url: string): string {
  return url.replace(SERVER_PREFIX, '').split('?')[0] ?? url
}

function readFileInRoot(path: string, root: string) {
  return Effect.tryPromise(async () => {
    const base = await realpath(root)
    const absolute = await realpath(resolve(base, path))
    if (absolute !== base && !absolute.startsWith(base + sep)) throw new Error(`refused: ${path} outside project root`)
    return readFile(absolute, 'utf8')
  })
}

function fetchLoopback(url: string, fetchImpl: typeof fetch) {
  return Effect.tryPromise(async (signal) => {
    if (!LOOPBACK_HOSTS.has(new URL(url).hostname)) throw new Error(`refused: non-loopback host ${url}`)
    return (await fetchImpl(url, {signal})).text()
  }).pipe(Effect.timeout(Duration.millis(SOURCE_FETCH_TIMEOUT_MS)))
}

function readUrl(url: string, root: string, fetchImpl: typeof fetch): Effect.Effect<string, unknown> {
  const clean = normalizeUrl(url)
  if (clean.startsWith('file://'))
    return Effect.try(() => fileURLToPath(clean)).pipe(Effect.flatMap((path) => readFileInRoot(path, root)))
  if (clean.startsWith('http')) return fetchLoopback(clean, fetchImpl)
  return readFileInRoot(clean, root)
}

function loadSourceMap(chunkUrl: string, root: string, fetchImpl: typeof fetch): Effect.Effect<string, unknown> {
  const clean = normalizeUrl(chunkUrl)
  return readUrl(chunkUrl, root, fetchImpl).pipe(
    Effect.flatMap((script) => {
      const reference = script.match(/\/\/[#@]\s*sourceMappingURL=([^\s'"]+)\s*$/m)
      if (!reference) return readUrl(clean + '.map', root, fetchImpl)
      const mapUrl = (reference[1] ?? '').trim()
      if (mapUrl.startsWith('data:'))
        return Effect.succeed(Buffer.from(mapUrl.slice(mapUrl.indexOf('base64,') + 7), 'base64').toString('utf8'))
      return Effect.try(() => new URL(mapUrl, clean).href).pipe(
        Effect.flatMap((href) => readUrl(href, root, fetchImpl)),
      )
    }),
  )
}

function firstPosition(traced: TraceMap, frame: RawFrame, line: number): SourceLoc | null {
  const position = [(frame.column ?? 1) - 1, frame.column ?? 0, 0]
    .map((column) => originalPositionFor(traced, {line, column: Math.max(0, column)}))
    .find((candidate) => candidate.source)
  if (!position?.source) return null
  return {file: position.source, line: position.line ?? line, column: position.column ?? 0}
}

function parseSourceMap(
  chunkUrl: string,
  root: string,
  fetchImpl: typeof fetch,
): Effect.Effect<TraceMap | null, unknown> {
  return loadSourceMap(chunkUrl, root, fetchImpl).pipe(
    Effect.flatMap((map) => Effect.try((): TraceMap | null => new AnyMap(map)).pipe(Effect.orElseSucceed(() => null))),
  )
}

export const makeSymbolicator = Effect.fn('makeSymbolicator')(function* (options: {
  root: string
  fetch?: typeof fetch
}) {
  const fetchImpl = options.fetch ?? fetch
  const maps = yield* Cache.makeWith((chunkUrl: string) => parseSourceMap(chunkUrl, options.root, fetchImpl), {
    capacity: SOURCE_MAP_CAPACITY,
    timeToLive: (exit) => (Exit.isSuccess(exit) ? SOURCE_MAP_TIME_TO_LIVE : Duration.zero),
  })
  return {
    frames: (frames: readonly RawFrame[]): Effect.Effect<SourceLoc | null> =>
      Effect.gen(function* () {
        for (const frame of frames) {
          const {fileName, line} = frame
          if (fileName === undefined || line === undefined) continue
          const location = yield* Cache.get(maps, fileName).pipe(
            Effect.flatMap((traced) => Effect.try(() => (traced ? firstPosition(traced, frame, line) : null))),
            Effect.orElseSucceed(() => null),
          )
          if (location && !location.file.includes('node_modules')) return location
        }
        return null
      }),
  }
})

export type Symbolicator = Effect.Success<ReturnType<typeof makeSymbolicator>>
