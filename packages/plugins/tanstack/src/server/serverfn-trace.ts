import type {BundlerDiagnostic} from '@conciv/protocol/bundler-types'
import type {ServerFnInfo, ServerFnTrace} from '@conciv/protocol/framework-types'

export type ServerFnTraceRing = {
  observe: (diagnostic: BundlerDiagnostic) => void
  traces: (count?: number) => ServerFnTrace[]
  functions: () => ServerFnInfo[]
}

type RequestTraceDiagnostic = Extract<BundlerDiagnostic, {kind: 'request-trace'}>

type DecodedServerFn = {file: string; export: string}

const SERVER_FN_PREFIX = '/_serverFn/'
const DEFAULT_CAPACITY = 100

function isRequestTrace(diagnostic: BundlerDiagnostic): diagnostic is RequestTraceDiagnostic {
  return diagnostic.kind === 'request-trace'
}

function encodedSegment(url: string): string | null {
  const prefixAt = url.indexOf(SERVER_FN_PREFIX)
  if (prefixAt === -1) return null
  const rest = url.slice(prefixAt + SERVER_FN_PREFIX.length)
  const end = rest.search(/[/?#]/)
  const segment = end === -1 ? rest : rest.slice(0, end)
  return segment.length > 0 ? segment : null
}

function decodeServerFn(segment: string): DecodedServerFn | null {
  try {
    const json = Buffer.from(segment, 'base64').toString('utf8')
    const parsed: unknown = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null) return null
    if (!('file' in parsed) || !('export' in parsed)) return null
    const file = parsed.file
    const exported = parsed.export
    if (typeof file !== 'string' || typeof exported !== 'string') return null
    return {file, export: exported}
  } catch {
    return null
  }
}

function toTrace(diagnostic: RequestTraceDiagnostic, segment: string, decoded: DecodedServerFn): ServerFnTrace {
  return {
    id: segment,
    name: decoded.export,
    durationMs: diagnostic.durationMs,
    status: diagnostic.status < 400 ? 'ok' : 'error',
    at: diagnostic.timestamp,
  }
}

export function makeServerFnTraceRing(capacity = DEFAULT_CAPACITY): ServerFnTraceRing {
  let stored: ServerFnTrace[] = []
  const files = new Map<string, string>()
  return {
    observe(diagnostic) {
      if (!isRequestTrace(diagnostic)) return
      const segment = encodedSegment(diagnostic.url)
      if (!segment) return
      const decoded = decodeServerFn(segment)
      if (!decoded) return
      files.set(segment, decoded.file)
      stored = [...stored, toTrace(diagnostic, segment, decoded)].slice(-capacity)
    },
    traces(count) {
      if (count === undefined) return [...stored]
      return stored.slice(-count)
    },
    functions() {
      const seen = new Map<string, ServerFnInfo>()
      for (const trace of stored) {
        seen.set(trace.id, {id: trace.id, name: trace.name, route: null, file: files.get(trace.id) ?? null})
      }
      return [...seen.values()]
    },
  }
}
