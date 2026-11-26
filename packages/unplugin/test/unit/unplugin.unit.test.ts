import {chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {DevTools} from '@vitejs/devtools'
import {describe} from 'vitest'
import {concivStateDir} from '@conciv/types/state-types'
import conciv from '../../src/vite.js'
import concivWebpack from '../../src/webpack.js'
import {test} from '../utils/unplugin-test.js'

describe.concurrent('a vite server on a fixture project', () => {
  test.for([
    {name: 'under vitest (mode test)', mode: 'test', options: {}},
    {name: 'with enabled false', mode: 'development', options: {enabled: false}},
  ])(
    'conciv() $name boots no engine, adds no conciv tags to the page and stamps no source on a module',
    async ({mode, options}, {project, serve, expect}) => {
      const root = project('app')
      const server = await serve({
        root,
        mode,
        oxc: {jsx: {runtime: 'classic'}},
        plugins: [conciv({...options, homeDir: join(root, 'home')})],
      })
      const [local] = server.resolvedUrls?.local ?? []

      const page = await (await fetch(new URL('/', local))).text()
      expect(page).toContain('<title>Shop</title>')
      expect(page).not.toContain('conciv-api-base')
      expect(page).not.toContain('conciv-widget')

      const module = await fetch(new URL('/src/app.jsx', local))
      expect(module.status).toBe(200)
      expect(await module.text()).not.toContain('data-tsd-source')

      expect(existsSync(concivStateDir(root))).toBe(false)
    },
  )

  test("with Vite DevTools on, a socket that never logged in to DevTools is refused the engine's login token", async ({
    project,
    serve,
    expect,
    webSocket,
  }) => {
    const root = project('app')
    const server = await serve({root, plugins: [conciv({homeDir: join(root, 'home')}), DevTools()]})
    const [local = ''] = server.resolvedUrls?.local ?? []
    await fetch(local)
    const socket = webSocket(`${local.replace('http', 'ws')}__devtools/__ws`)
    const answered = new Promise<string>((resolve, reject) => {
      socket.addEventListener('message', (event) => {
        if (String(event.data).includes('engine-token-probe')) resolve(String(event.data))
      })
      socket.addEventListener('error', () => reject(new Error('the DevTools socket failed')))
    })
    socket.addEventListener('open', () =>
      socket.send(JSON.stringify({t: 'q', i: 'engine-token-probe', m: 'conciv:engine-token', a: []})),
    )

    const answer = await answered

    expect(answer).toContain('RPC call to \\"conciv:engine-token\\" was rejected: the caller is not authorized.')
  })
})

describe.concurrent('bundler builds', () => {
  test('a webpack production build with conciv() gives the same output as one without, and writes no conciv state', async ({
    project,
    webpackBuild,
    expect,
  }) => {
    const root = project('app')
    await webpackBuild({
      mode: 'production',
      context: root,
      entry: './src/greeting.js',
      output: {path: join(root, 'plain')},
    })
    await webpackBuild({
      mode: 'production',
      context: root,
      entry: './src/greeting.js',
      output: {path: join(root, 'with-conciv')},
      plugins: [concivWebpack()],
    })

    expect(readdirSync(join(root, 'with-conciv'))).toEqual(readdirSync(join(root, 'plain')))
    expect(readFileSync(join(root, 'with-conciv', 'main.js'), 'utf8')).toBe(
      readFileSync(join(root, 'plain', 'main.js'), 'utf8'),
    )
    expect(existsSync(concivStateDir(root))).toBe(false)
  })

  test.for<{name: string; options: Parameters<typeof concivWebpack>[0]; blockState: boolean}>([
    {name: 'widget false', options: {widget: false}, blockState: false},
    {name: 'a bad port', options: {port: 70_000}, blockState: false},
    {name: 'a .conciv it cannot write', options: {}, blockState: true},
  ])(
    'a webpack development build gives the same output as one without conciv() when conciv adds no widget: $name',
    async ({options, blockState}, {project, webpackBuild, expect}) => {
      const root = project('app')
      if (blockState) writeFileSync(concivStateDir(root), '')
      const plain = join(root, 'plain')
      await webpackBuild({mode: 'development', context: root, entry: './src/greeting.js', output: {path: plain}})
      const withConciv = join(root, 'with-conciv')
      await webpackBuild({
        mode: 'development',
        context: root,
        entry: './src/greeting.js',
        output: {path: withConciv},
        plugins: [concivWebpack(options)],
      })

      expect(readdirSync(withConciv)).toEqual(readdirSync(plain))
      expect(readFileSync(join(withConciv, 'main.js'), 'utf8')).toBe(readFileSync(join(plain, 'main.js'), 'utf8'))
      expect(existsSync(concivStateDir(root))).toBe(blockState)
    },
  )
})

describe('a webpack development watch build', () => {
  test('boots the engine on a free port when the asked one is held, and builds every entry with a widget client for that same port', async ({
    project,
    webpackWatch,
    holdPort,
    expect,
  }) => {
    const root = project('app')
    const asked = await holdPort()
    const stats = await webpackWatch({
      mode: 'development',
      context: root,
      entry: {first: './src/greeting.js', second: './src/greeting.js'},
      output: {path: join(root, 'dist')},
      externals: ['@conciv/app'],
      plugins: [concivWebpack({port: asked, stateRoot: root, homeDir: join(root, 'home')})],
    })

    const client = join(concivStateDir(realpathSync(root)), `widget-client.${asked}.gen.js`)
    const builtPort = Number(/startConcivWidget\((\d+)\)/.exec(readFileSync(client, 'utf8'))?.[1])
    expect(builtPort).not.toBe(asked)
    expect((await fetch(`http://127.0.0.1:${builtPort}/health`)).status).toBe(200)

    const {entrypoints, chunkGraph} = stats.compilation
    const entryModules = [...entrypoints].map(([name, entrypoint]) => ({
      name,
      modules: entrypoint.chunks
        .flatMap((chunk) => [...chunkGraph.getChunkModulesIterable(chunk)])
        .map((module) => module.nameForCondition()),
    }))
    const greeting = join(realpathSync(root), 'src', 'greeting.js')
    expect(entryModules).toEqual([
      {name: 'first', modules: expect.arrayContaining([greeting, client])},
      {name: 'second', modules: expect.arrayContaining([greeting, client])},
    ])
  })

  test.for([
    {name: 'the engine cannot start', block: 'state'},
    {name: 'the widget client cannot be rewritten for the chosen port', block: 'client'},
  ])(
    'fails the build when $name, instead of leaving the page on no engine',
    async ({block}, {project, webpackWatch, expect}) => {
      const root = project('app')
      const stateRoot = join(root, 'state-root')
      mkdirSync(stateRoot)
      if (block === 'state') writeFileSync(concivStateDir(stateRoot), '')
      const lockWidgetClient = {
        apply: () =>
          readdirSync(concivStateDir(root))
            .filter((name) => name.startsWith('widget-client.'))
            .forEach((name) => chmodSync(join(concivStateDir(root), name), 0o444)),
      }
      await expect(
        webpackWatch({
          mode: 'development',
          context: root,
          entry: './src/greeting.js',
          output: {path: join(root, 'dist')},
          externals: ['@conciv/app'],
          plugins: [
            concivWebpack({stateRoot, homeDir: join(root, 'home')}),
            ...(block === 'client' ? [lockWidgetClient] : []),
          ],
        }).then(() => 'the build finished'),
      ).rejects.toThrow('conciv: the engine failed to start')
    },
  )
})
