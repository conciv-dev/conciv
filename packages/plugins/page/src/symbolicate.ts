import {readFile, realpath} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {resolve, sep} from 'node:path'
import {AnyMap, originalPositionFor} from '@jridgewell/trace-mapping'
import {Duration, Effect} from 'effect'
import type {RawFrame, SourceLoc} from '@conciv/contract'

const SERVER_PREFIX = /^about:\/\/React\/Server\//
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
const SOURCE_FETCH_TIMEOUT_MS = 5000

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

function firstPosition(map: string, frame: RawFrame, line: number): SourceLoc | null {
  const traced = new AnyMap(map)
  const position = [(frame.column ?? 1) - 1, frame.column ?? 0, 0]
    .map((column) => originalPositionFor(traced, {line, column: Math.max(0, column)}))
    .find((candidate) => candidate.source)
  if (!position?.source) return null
  return {file: position.source, line: position.line ?? line, column: position.column ?? 0}
}

function locate(frame: RawFrame, root: string, fetchImpl: typeof fetch): Effect.Effect<SourceLoc | null> {
  const {fileName, line} = frame
  if (fileName === undefined || line === undefined) return Effect.succeed(null)
  return loadSourceMap(fileName, root, fetchImpl).pipe(
    Effect.flatMap((map) => Effect.try(() => firstPosition(map, frame, line))),
    Effect.orElseSucceed(() => null),
  )
}

export function symbolicateFrame(
  frame: RawFrame,
  root: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SourceLoc | null> {
  return Effect.runPromise(locate(frame, root, fetchImpl))
}

export function symbolicateFrames(
  frames: RawFrame[],
  root: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SourceLoc | null> {
  return Effect.runPromise(
    Effect.gen(function* () {
      for (const frame of frames) {
        const location = yield* locate(frame, root, fetchImpl)
        if (location && !location.file.includes('node_modules')) return location
      }
      return null
    }),
  )
}
