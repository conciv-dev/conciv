import {realpath} from 'node:fs/promises'
import {resolve, sep} from 'node:path'

export const SNIPPET_LIMIT = 2_048

// Resolve `file` under `root` and return its absolute realpath, throwing if it escapes the root. Uses
// realpath (NOT path.resolve) on both so a symlink whose target sits outside the root is rejected —
// resolve() does not dereference symlinks, so a symlinked escape would slip through a prefix check.
export async function confineToRoot(root: string, file: string): Promise<string> {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(file) || file.startsWith('file:'))
    throw new Error(`refusing non-filesystem path: ${file}`)
  const realRoot = await realpath(root)
  const real = await realpath(resolve(realRoot, file))
  if (real !== realRoot && !real.startsWith(realRoot + sep)) throw new Error(`path escapes project root: ${file}`)
  return real
}

const SECRET_PATH = /(^|\/)(\.env(\.|$)|id_rsa$|id_ed25519$|id_dsa$|[^/]*\.pem$|[^/]*\.key$|[^/]*\.p12$|[^/]*\.pfx$)/i

// Paths whose contents must never be snippet-captured (the anchor still records file:line, but no text
// egresses to the LLM): dotenv files, private keys, certs.
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

// Strip obvious secrets from a captured snippet (known token prefixes, JWT shape, Bearer headers,
// SECRET/TOKEN/PASSWORD-style assignments) and cap the length. Non-backtracking patterns only.
export function redactSnippet(text: string): string {
  const truncated = text.length > SNIPPET_LIMIT ? text.slice(0, SNIPPET_LIMIT) : text
  return REDACTIONS.reduce((acc, pattern) => acc.replace(pattern, '[redacted]'), truncated)
}
