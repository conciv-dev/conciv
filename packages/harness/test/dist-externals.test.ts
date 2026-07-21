import {readdirSync, readFileSync, statSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'

const distDir = fileURLToPath(new URL('../dist', import.meta.url))

function collectChunks(dir: string): string[] {
  const chunks: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      chunks.push(...collectChunks(full))
    } else if (name.endsWith('.js')) {
      chunks.push(readFileSync(full, 'utf8'))
    }
  }
  return chunks
}

const chunks = collectChunks(distDir)

const imported = (pattern: RegExp) => chunks.some((code) => pattern.test(code))

describe('harness dist keeps @tanstack/ai-sandbox free of peer edges (#107)', () => {
  it('bundles the @tanstack/ai-* adapters instead of importing them', () => {
    expect(imported(/from\s*["']@tanstack\/ai-(acp|claude-code|codex|opencode)["']/)).toBe(false)
  })

  it('externalizes @tanstack/ai-sandbox so capability-handle identity is shared with core', () => {
    expect(imported(/from\s*["']@tanstack\/ai-sandbox["']/)).toBe(true)
  })

  it('externalizes @tanstack/ai', () => {
    expect(imported(/from\s*["']@tanstack\/ai(\/[\w-]+)?["']/)).toBe(true)
  })

  it('bundles no private capability-handle copy (identity mismatch breaks chat() validate)', () => {
    expect(chunks.some((code) => code.includes('createCapability()('))).toBe(false)
  })
})
