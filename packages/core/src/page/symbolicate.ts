import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {resolve, sep} from 'node:path'
import {AnyMap, originalPositionFor} from '@jridgewell/trace-mapping'

// A raw stack frame from the browser: chunk URL plus 1-based line/column.
export type RawFrame = {fileName: string; line: number; column?: number; fn?: string}
export type SourceLoc = {file: string; line: number; column: number}

const SERVER_PREFIX = /^about:\/\/React\/Server\//
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

// Strip React's synthetic server-chunk prefix and any ?query so the URL is fetchable.
function normalizeUrl(url: string): string {
  return url.replace(SERVER_PREFIX, '').split('?')[0] ?? url
}

// A filesystem path must resolve inside the project root — the chunk/map URLs come from the
// (untrusted) widget reply, so a bare/file:// path could otherwise traverse to ../../etc/passwd.
function readFileInRoot(path: string, root: string): Promise<string> {
  const abs = resolve(path)
  const base = resolve(root)
  if (abs !== base && !abs.startsWith(base + sep)) throw new Error(`refused: ${path} outside project root`)
  return readFile(abs, 'utf8')
}

// http(s) chunk URLs only resolve against the loopback dev server — never an arbitrary host
// (blocks SSRF to internal/metadata endpoints like 169.254.169.254).
async function fetchLoopback(url: string, fetchImpl: typeof fetch): Promise<string> {
  if (!LOOPBACK_HOSTS.has(new URL(url).hostname)) throw new Error(`refused: non-loopback host ${url}`)
  return (await fetchImpl(url)).text()
}

// Read a chunk or map by URL scheme: file:// + bare path off disk (root-confined), http over fetch (loopback-only).
async function readUrl(url: string, root: string, fetchImpl: typeof fetch): Promise<string> {
  const clean = normalizeUrl(url)
  if (clean.startsWith('file://')) return readFileInRoot(fileURLToPath(clean), root)
  if (clean.startsWith('http')) return fetchLoopback(clean, fetchImpl)
  return readFileInRoot(clean, root)
}

// Discover and load the source map for a chunk: inline data: map, sourceMappingURL comment, or sibling .map.
async function loadSourceMap(chunkUrl: string, root: string, fetchImpl: typeof fetch): Promise<unknown> {
  const clean = normalizeUrl(chunkUrl)
  const js = await readUrl(chunkUrl, root, fetchImpl)
  const m = js.match(/\/\/[#@]\s*sourceMappingURL=([^\s'"]+)\s*$/m)
  if (m) {
    const u = (m[1] ?? '').trim()
    if (u.startsWith('data:'))
      return JSON.parse(Buffer.from(u.slice(u.indexOf('base64,') + 7), 'base64').toString('utf8'))
    return JSON.parse(await readUrl(new URL(u, clean).href, root, fetchImpl))
  }
  return JSON.parse(await readUrl(clean + '.map', root, fetchImpl))
}

// Resolve one raw frame to original source. AnyMap handles both flat and sectioned maps.
export async function symbolicateFrame(
  frame: RawFrame,
  root: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SourceLoc | null> {
  try {
    const map = await loadSourceMap(frame.fileName, root, fetchImpl)
    const tm = new AnyMap(map as never)
    for (const col of [(frame.column ?? 1) - 1, frame.column ?? 0, 0]) {
      const pos = originalPositionFor(tm, {line: frame.line, column: Math.max(0, col)})
      if (pos.source) return {file: pos.source, line: pos.line ?? frame.line, column: pos.column ?? 0}
    }
  } catch {
    return null
  }
  return null
}

// First frame that resolves to non-dependency source wins (skips framework internals).
export async function symbolicateFrames(
  frames: RawFrame[],
  root: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SourceLoc | null> {
  for (const frame of frames) {
    const loc = await symbolicateFrame(frame, root, fetchImpl)
    if (loc && !loc.file.includes('node_modules')) return loc
  }
  return null
}
