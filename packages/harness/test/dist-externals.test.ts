import {readdirSync, readFileSync, statSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
import {parseSync} from 'oxc-parser'
import {describe, expect, it} from 'vitest'

const distDir = fileURLToPath(new URL('../dist', import.meta.url))

type Chunk = {file: string; code: string}

function collectChunks(dir: string): Chunk[] {
  const chunks: Chunk[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      chunks.push(...collectChunks(full))
    } else if (name.endsWith('.js')) {
      chunks.push({file: full, code: readFileSync(full, 'utf8')})
    }
  }
  return chunks
}

function stripQuotes(text: string): string {
  if (/^['"].*['"]$/.test(text)) return text.slice(1, -1)
  return text
}

function moduleSources(chunk: Chunk): string[] {
  const parsed = parseSync(chunk.file, chunk.code, {sourceType: 'module'})
  if (parsed.errors.length > 0) throw new Error(`failed to parse dist chunk ${chunk.file}`)
  const staticSources = parsed.module.staticImports.map((statement) => statement.moduleRequest.value)
  const reexportSources = parsed.module.staticExports.flatMap((statement) =>
    statement.entries.flatMap((entry) => (entry.moduleRequest ? [entry.moduleRequest.value] : [])),
  )
  const dynamicSources = parsed.module.dynamicImports.map((statement) =>
    stripQuotes(chunk.code.slice(statement.moduleRequest.start, statement.moduleRequest.end)),
  )
  return [...staticSources, ...reexportSources, ...dynamicSources]
}

const chunks = collectChunks(distDir)
const sources = chunks.flatMap(moduleSources)

const importsPackage = (name: string) => sources.some((source) => source === name || source.startsWith(`${name}/`))

describe('harness dist keeps @tanstack/ai-sandbox free of peer edges (#107)', () => {
  it('bundles the @tanstack/ai-* adapters instead of importing them', () => {
    for (const adapter of [
      '@tanstack/ai-acp',
      '@tanstack/ai-claude-code',
      '@tanstack/ai-codex',
      '@tanstack/ai-opencode',
    ]) {
      expect(importsPackage(adapter), `dist imports ${adapter}`).toBe(false)
    }
  })

  it('externalizes @tanstack/ai-sandbox so capability-handle identity is shared with core', () => {
    expect(importsPackage('@tanstack/ai-sandbox')).toBe(true)
  })

  it('externalizes @tanstack/ai', () => {
    expect(importsPackage('@tanstack/ai')).toBe(true)
  })

  it('bundles no private capability-handle copy (identity mismatch breaks chat() validate)', () => {
    expect(chunks.some((chunk) => chunk.code.includes('createCapability()('))).toBe(false)
  })
})
