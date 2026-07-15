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

  it('rejects escaping paths and keeps the rest', async () => {
    const origin = await serveManifest(
      JSON.stringify({'../evil.txt': 'nope', '/abs.txt': 'nope', 'src/ok.ts': 'export const ok = 1\n'}),
    )
    const root = mkdtempSync(join(tmpdir(), 'conciv-seed-'))
    const seeded = await seedWorkspace(origin, root)
    expect(seeded).toBe(true)
    expect(existsSync(join(root, 'src/ok.ts'))).toBe(true)
    expect(existsSync(join(root, '..', 'evil.txt'))).toBe(false)
    expect(existsSync(join(root, 'abs.txt'))).toBe(false)
  })

  it('returns false and writes nothing when the manifest is missing', async () => {
    const origin = await serveManifest('not found', 404)
    const root = mkdtempSync(join(tmpdir(), 'conciv-seed-'))
    const seeded = await seedWorkspace(origin, root)
    expect(seeded).toBe(false)
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(false)
  })
})
