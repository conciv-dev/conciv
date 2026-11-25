import {readdirSync, readFileSync} from 'node:fs'
import {once} from 'node:events'
import {createServer} from 'node:http'
import {join} from 'node:path'
import {describe, expect, test} from 'vitest'
import {tempDir} from '@internal/vitest-config/temp-dir'
import {seedWorkspace} from '../../src/seed-workspace.js'

describe('seeding the try workspace from the site', () => {
  test('writes package.json and files under src, refuses every path that leaves src, and refuses a streamed manifest over the size cap', async () => {
    const manifests: Record<string, string> = {
      '/good/site-source.json': JSON.stringify({
        'package.json': '{"name":"fern-shop"}',
        'src/app.tsx': 'export const App = () => null',
        '../escaped.txt': 'outside',
        'src/../../escaped-too.txt': 'outside',
        '/tmp/absolute.txt': 'outside',
        'src/..\\..\\windows.txt': 'outside',
        'src//double.txt': 'outside',
        'README.md': 'not under src',
      }),
      '/huge/site-source.json': JSON.stringify({'src/big.txt': 'x'.repeat(8 * 1024 * 1024)}),
    }
    const server = createServer((request, response) => {
      const manifest = manifests[request.url ?? '']
      response.writeHead(manifest === undefined ? 404 : 200, {'content-type': 'application/json'})
      response.write(manifest ?? '')
      response.end()
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    const origin = typeof address === 'object' && address !== null ? `http://127.0.0.1:${address.port}` : ''
    const parent = tempDir('try-seed-')
    const root = join(parent, 'workspace')
    const hugeRoot = join(parent, 'huge-workspace')

    try {
      expect(await seedWorkspace(`${origin}/good`, root)).toBe(true)
      expect(await seedWorkspace(`${origin}/huge`, hugeRoot)).toBe(false)
    } finally {
      server.close()
    }

    expect(readdirSync(root).toSorted()).toEqual(['AGENTS.md', 'package.json', 'src'])
    expect(readdirSync(join(root, 'src'))).toEqual(['app.tsx'])
    expect(readFileSync(join(root, 'src', 'app.tsx'), 'utf8')).toBe('export const App = () => null')
    expect(readdirSync(parent)).toEqual(['workspace'])
  })
})
