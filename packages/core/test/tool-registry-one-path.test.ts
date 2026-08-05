import {describe, expect, it} from 'vitest'
import {readdirSync, readFileSync, statSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

const SRC = fileURLToPath(new URL('../src', import.meta.url))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : []
  })
}

function filesMatching(pattern: RegExp): string[] {
  return sourceFiles(SRC)
    .filter((file) => pattern.test(readFileSync(file, 'utf8')))
    .map((file) => file.slice(SRC.length + 1))
}

describe('one implementation behind every built-in capability', () => {
  it('asks the page bus from nowhere but the module that journals and symbolicates', () => {
    expect(filesMatching(/[Bb]us\.ask\(/)).toEqual(['page-bus.ts'])
  })

  it('runs a dev-server operation by calling its tool, never by holding the bundler in the rpc layer', () => {
    const router = readFileSync(join(SRC, 'api/rpc/router.ts'), 'utf8')
    expect(router).not.toMatch(/deps\.bundler\(\)/)
    expect(router).toMatch(/callTool\(deps, 'server\./)
  })
})
