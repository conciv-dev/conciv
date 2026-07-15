import {createServer, type Server} from 'node:http'
import {existsSync, mkdtempSync, readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterAll, describe, expect, it} from 'vitest'
import {seedWorkspace} from '../src/seed-workspace.js'

const servers: Server[] = []

function serveManifest(body: string, status = 200): Promise<string> {
  const server = createServer((request, response) => {
    if (request.url === '/site-source.json') {
      response.writeHead(status, {'content-type': 'application/json'})
      response.end(body)
      return
    }
    response.writeHead(404)
    response.end()
  })
  servers.push(server)
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve(typeof address === 'object' && address ? `http://127.0.0.1:${address.port}` : '')
    })
  })
}

afterAll(() => {
  servers.forEach((server) => server.close())
})

describe('seedWorkspace', () => {
  it('writes manifest files and AGENTS.md into the workspace', async () => {
    const origin = await serveManifest(
      JSON.stringify({'src/components/landing/hero.tsx': 'export function Hero() {}\n', 'package.json': '{}\n'}),
    )
    const root = mkdtempSync(join(tmpdir(), 'conciv-seed-'))
    const seeded = await seedWorkspace(origin, root)
    expect(seeded).toBe(true)
    expect(readFileSync(join(root, 'src/components/landing/hero.tsx'), 'utf8')).toContain('Hero')
    expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toContain('data-conciv-source')
  })

  it('only writes src/** and package.json, dropping escaping and out-of-tree paths', async () => {
    const origin = await serveManifest(
      JSON.stringify({
        '../evil.txt': 'nope',
        '/abs.txt': 'nope',
        'CLAUDE.md': 'planted context',
        '.mcp.json': '{}',
        'src\\win.ts': 'nope',
        'src/ok.ts': 'export const ok = 1\n',
        'package.json': '{}\n',
      }),
    )
    const root = mkdtempSync(join(tmpdir(), 'conciv-seed-'))
    const seeded = await seedWorkspace(origin, root)
    expect(seeded).toBe(true)
    expect(existsSync(join(root, 'src/ok.ts'))).toBe(true)
    expect(existsSync(join(root, 'package.json'))).toBe(true)
    expect(existsSync(join(root, '..', 'evil.txt'))).toBe(false)
    expect(existsSync(join(root, 'abs.txt'))).toBe(false)
    expect(existsSync(join(root, 'CLAUDE.md'))).toBe(false)
    expect(existsSync(join(root, '.mcp.json'))).toBe(false)
  })

  it('skips non-string manifest values and non-object payloads', async () => {
    const origin = await serveManifest(JSON.stringify({'src/ok.ts': 'export const ok = 1\n', 'src/bad.ts': 123}))
    const root = mkdtempSync(join(tmpdir(), 'conciv-seed-'))
    expect(await seedWorkspace(origin, root)).toBe(true)
    expect(existsSync(join(root, 'src/ok.ts'))).toBe(true)
    expect(existsSync(join(root, 'src/bad.ts'))).toBe(false)

    const arrayOrigin = await serveManifest(JSON.stringify(['src/x.ts']))
    const arrayRoot = mkdtempSync(join(tmpdir(), 'conciv-seed-'))
    expect(await seedWorkspace(arrayOrigin, arrayRoot)).toBe(true)
    expect(existsSync(join(arrayRoot, 'src/x.ts'))).toBe(false)
  })

  it('returns false and writes nothing when the manifest is missing', async () => {
    const origin = await serveManifest('not found', 404)
    const root = mkdtempSync(join(tmpdir(), 'conciv-seed-'))
    const seeded = await seedWorkspace(origin, root)
    expect(seeded).toBe(false)
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(false)
  })

  it('returns false when the origin is unreachable', async () => {
    const root = mkdtempSync(join(tmpdir(), 'conciv-seed-'))
    const seeded = await seedWorkspace('http://127.0.0.1:1', root)
    expect(seeded).toBe(false)
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(false)
  })

  it('rejects a manifest larger than the size cap', async () => {
    const origin = await serveManifest(JSON.stringify({'src/big.ts': 'x'.repeat(9 * 1024 * 1024)}))
    const root = mkdtempSync(join(tmpdir(), 'conciv-seed-'))
    const seeded = await seedWorkspace(origin, root)
    expect(seeded).toBe(false)
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(false)
  })
})
