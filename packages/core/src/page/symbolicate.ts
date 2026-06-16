import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {AnyMap, originalPositionFor} from '@jridgewell/trace-mapping'

// A raw stack frame from the browser: chunk URL plus 1-based line/column.
export type RawFrame = {fileName: string; line: number; column?: number; fn?: string}
export type SourceLoc = {file: string; line: number; column: number}

const SERVER_PREFIX = /^about:\/\/React\/Server\//

// Strip React's synthetic server-chunk prefix and any ?query so the URL is fetchable.
function normalizeUrl(url: string): string {
  return url.replace(SERVER_PREFIX, '').split('?')[0] ?? url
}

// Read a chunk or map by URL scheme: file:// off disk, http over fetch, bare path off disk.
async function readUrl(url: string, fetchImpl: typeof fetch): Promise<string> {
  const clean = normalizeUrl(url)
  if (clean.startsWith('file://')) return readFile(fileURLToPath(clean), 'utf8')
  if (clean.startsWith('http')) return (await fetchImpl(clean)).text()
  return readFile(clean, 'utf8')
}

// Discover and load the source map for a chunk: inline data: map, sourceMappingURL comment, or sibling .map.
async function loadSourceMap(chunkUrl: string, fetchImpl: typeof fetch): Promise<unknown> {
  const clean = normalizeUrl(chunkUrl)
  const js = await readUrl(chunkUrl, fetchImpl)
  const m = js.match(/\/\/[#@]\s*sourceMappingURL=([^\s'"]+)\s*$/m)
  if (m) {
    const u = (m[1] ?? '').trim()
    if (u.startsWith('data:'))
      return JSON.parse(Buffer.from(u.slice(u.indexOf('base64,') + 7), 'base64').toString('utf8'))
    return JSON.parse(await readUrl(new URL(u, clean).href, fetchImpl))
  }
  return JSON.parse(await readUrl(clean + '.map', fetchImpl))
}

// Resolve one raw frame to original source. AnyMap handles both flat and sectioned maps.
export async function symbolicateFrame(frame: RawFrame, fetchImpl: typeof fetch = fetch): Promise<SourceLoc | null> {
  try {
    const map = await loadSourceMap(frame.fileName, fetchImpl)
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
  fetchImpl: typeof fetch = fetch,
): Promise<SourceLoc | null> {
  for (const frame of frames) {
    const loc = await symbolicateFrame(frame, fetchImpl)
    if (loc && !loc.file.includes('node_modules')) return loc
  }
  return null
}
