import {realpathSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {describe, expect} from 'vitest'
import type {Diagnostic} from '@conciv/protocol/schema/bundler'
import {makeViteBridge} from '../../src/core/vite-bridge.js'
import {test} from '../utils/unplugin-test.js'

describe('the vite bridge', () => {
  test('the agent reads the config, resolves, transforms and walks the graph, gets the urls and restarts the server', async ({
    project,
    serve,
  }) => {
    const root = realpathSync(project('app'))
    const server = await serve({
      root,
      oxc: {jsx: {runtime: 'classic'}},
      resolve: {alias: {'@shop': '/src'}},
      plugins: [{name: 'shop-plugin'}],
    })
    const bridge = await makeViteBridge(server)

    expect(bridge.config()).toMatchObject({
      root,
      base: '/',
      mode: 'development',
      aliases: expect.arrayContaining([{find: '@shop', replacement: '/src'}]),
      plugins: expect.arrayContaining(['shop-plugin']),
    })

    await expect(bridge.resolve('./greeting.js', join(root, 'src', 'app.jsx'))).resolves.toEqual({
      id: join(root, 'src', 'greeting.js'),
    })
    await expect(bridge.resolve('./nowhere.js', join(root, 'src', 'app.jsx'))).resolves.toEqual({id: null})

    const {code} = await bridge.transform('/src/app.jsx')
    expect(code).toContain('/src/greeting.js')
    expect(code).not.toContain('<h1>')

    expect(bridge.moduleGraph('src/app.jsx')).toEqual([
      {url: '/src/app.jsx', importers: [], importedModules: ['/src/greeting.js']},
    ])
    expect(() => bridge.moduleGraph('src/nowhere.js')).toThrow(
      "no module for src/nowhere.js in the dev server's module graph",
    )

    const [local] = bridge.urls().local
    expect(local).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/)
    expect((await fetch(new URL('/', local))).status).toBe(200)

    await bridge.restart()
    expect((await fetch(new URL('/', bridge.urls().local[0]))).status).toBe(200)
  })

  test('a page request reaches the agent as a request trace, and a module that fails to build as a build error', async ({
    project,
    serve,
  }) => {
    const root = realpathSync(project('app'))
    writeFileSync(
      join(root, 'src', 'needs-missing.js'),
      "import {price} from './missing.js'\nexport const label = price\n",
    )
    const server = await serve({root})
    const bridge = await makeViteBridge(server)
    const diagnostics: Diagnostic[] = []
    bridge.subscribe?.((diagnostic) => {
      diagnostics.push(diagnostic)
    })
    const [local] = bridge.urls().local

    const page = await fetch(new URL('/', local))
    await page.text()
    expect(diagnostics).toContainEqual(
      expect.objectContaining({kind: 'request-trace', method: 'GET', url: '/', status: 200}),
    )

    const broken = await fetch(new URL('/src/needs-missing.js', local))
    await broken.text()
    expect(broken.status).toBe(500)
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        kind: 'build-error',
        message: expect.stringContaining('Failed to resolve import "./missing.js"'),
        file: join(root, 'src', 'needs-missing.js'),
      }),
    )
  })
})
