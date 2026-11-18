import {readFile, realpath} from 'node:fs/promises'
import {resolve, sep} from 'node:path'
import {Effect, Schema} from 'effect'

export const SNIPPET_LIMIT = 2_048

export const SourceUnreadable = Schema.TaggedStruct('SourceUnreadable', {file: Schema.String, message: Schema.String})
export type SourceUnreadable = typeof SourceUnreadable.Type

export const unreadable = (file: string) => (error: unknown) =>
  SourceUnreadable.make({file, message: error instanceof Error ? error.message : String(error)})

const realPath = (path: string, file: string) => Effect.tryPromise({try: () => realpath(path), catch: unreadable(file)})

export const confineToRoot = Effect.fn('whiteboard.anchor.confineToRoot')(function* (root: string, file: string) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(file) || file.startsWith('file:'))
    return yield* Effect.fail(SourceUnreadable.make({file, message: `refusing non-filesystem path: ${file}`}))
  const realRoot = yield* realPath(root, file)
  const real = yield* realPath(resolve(realRoot, file), file)
  if (real !== realRoot && !real.startsWith(realRoot + sep))
    return yield* Effect.fail(SourceUnreadable.make({file, message: `path escapes project root: ${file}`}))
  return real
})

export const readSource = Effect.fn('whiteboard.anchor.readSource')(function* (root: string, file: string) {
  const path = yield* confineToRoot(root, file)
  return yield* Effect.tryPromise({try: () => readFile(path, 'utf8'), catch: unreadable(file)})
})

const SECRET_PATH = /(^|\/)(\.env(\.|$)|id_rsa$|id_ed25519$|id_dsa$|[^/]*\.pem$|[^/]*\.key$|[^/]*\.p12$|[^/]*\.pfx$)/i

export function isSecretPath(file: string): boolean {
  return SECRET_PATH.test(file)
}

const REDACTIONS: RegExp[] = [
  /\b(?:sk|pk|rk)_[A-Za-z0-9_]{8,}/g,
  /\bghp_[A-Za-z0-9]{20,}/g,
  /\bAKIA[A-Z0-9]{12,}/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  /\bBearer\s+[A-Za-z0-9._-]{8,}/gi,
  /\b[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API[_-]?KEY|PRIVATE[_-]?KEY)[A-Z0-9_]*\s*[:=]\s*["']?[^\s"']+/gi,
]

export function redactSnippet(text: string): string {
  const truncated = text.length > SNIPPET_LIMIT ? text.slice(0, SNIPPET_LIMIT) : text
  return REDACTIONS.reduce((acc, pattern) => acc.replace(pattern, '[redacted]'), truncated)
}
