import {existsSync, readFileSync, readdirSync, realpathSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {describe} from 'vitest'
import {concivStateDir} from '@conciv/protocol/state-types'
import conciv from './vite.js'
import concivWebpack from './webpack.js'
import {test} from '../test/unplugin-test.js'

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
  test('boots the engine and adds the widget entry to every entry', async ({
    project,
    webpackWatch,
    freePort,
    expect,
  }) => {
    const root = project('app')
    const port = await freePort()
    const stats = await webpackWatch({
      mode: 'development',
      context: root,
      entry: {first: './src/greeting.js', second: './src/greeting.js'},
      output: {path: join(root, 'dist')},
      externals: ['@conciv/embed'],
      plugins: [concivWebpack({port, stateRoot: root, homeDir: join(root, 'home')})],
    })

    expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(200)

    const {entrypoints, chunkGraph} = stats.compilation
    const entryModules = [...entrypoints].map(([name, entrypoint]) => ({
      name,
      modules: entrypoint.chunks
        .flatMap((chunk) => [...chunkGraph.getChunkModulesIterable(chunk)])
        .map((module) => module.nameForCondition()),
    }))
    const client = join(concivStateDir(realpathSync(root)), `widget-client.${port}.gen.js`)
    const greeting = join(realpathSync(root), 'src', 'greeting.js')
    expect(entryModules).toEqual([
      {name: 'first', modules: expect.arrayContaining([greeting, client])},
      {name: 'second', modules: expect.arrayContaining([greeting, client])},
    ])
  })
})
