import {existsSync, readFileSync, readdirSync, realpathSync, writeFileSync} from 'node:fs'
import {basename, join} from 'node:path'
import {describe, expect} from 'vitest'
import {resolveConfig} from 'vite'
import {concivStateDir} from '@conciv/protocol/state-types'
import {createConcivUnplugin} from './index.js'
import conciv from './vite.js'
import concivWebpack from './webpack.js'
import {test} from '../test/unplugin-test.js'

describe('a vite server on a fixture project', () => {
  test.for([
    {name: 'under vitest (mode test)', mode: 'test', options: {}},
    {name: 'with enabled false', mode: 'development', options: {enabled: false}},
  ])(
    'conciv() $name boots no engine, adds no conciv tags to the page and stamps no source on a module',
    async ({mode, options}, {project, serve}) => {
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

describe('the vite dev server warm-up', () => {
  test('warms the embed entry and only the mount chunk that mount.js imports, never a stale chunk left beside it', async ({
    embedDist,
    project,
  }) => {
    const root = project('app')
    const config = await resolveConfig(
      {
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [createConcivUnplugin({embedEntry: embedDist.entry}).vite({homeDir: join(root, 'home')})],
      },
      'serve',
      'development',
    )
    const warmed = config.server.warmup.clientFiles ?? []

    expect(warmed).not.toContain(embedDist.stale)
    expect(warmed).toHaveLength(2)
    expect(warmed[0]).toBe(embedDist.entry)
    expect(readFileSync(embedDist.entry, 'utf8')).toContain(`import("./${basename(warmed[1] ?? 'no second file')}")`)
  })
})

describe('bundler builds', () => {
  test('a webpack production build with conciv() gives the same output as one without, and writes no conciv state', async ({
    project,
    webpackBuild,
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

  test('a webpack development build gives the same output as one without conciv() when conciv adds no widget: widget false, a bad port, or a .conciv it cannot write', async ({
    project,
    webpackBuild,
  }) => {
    const root = project('app')
    const plain = join(root, 'plain')
    await webpackBuild({mode: 'development', context: root, entry: './src/greeting.js', output: {path: plain}})
    const plainOutput = readFileSync(join(plain, 'main.js'), 'utf8')

    const noWidget = join(root, 'no-widget')
    await webpackBuild({
      mode: 'development',
      context: root,
      entry: './src/greeting.js',
      output: {path: noWidget},
      plugins: [concivWebpack({widget: false})],
    })
    expect(readdirSync(noWidget)).toEqual(readdirSync(plain))
    expect(readFileSync(join(noWidget, 'main.js'), 'utf8')).toBe(plainOutput)
    expect(existsSync(concivStateDir(root))).toBe(false)

    const badPort = join(root, 'bad-port')
    await webpackBuild({
      mode: 'development',
      context: root,
      entry: './src/greeting.js',
      output: {path: badPort},
      plugins: [concivWebpack({port: 70_000})],
    })
    expect(readFileSync(join(badPort, 'main.js'), 'utf8')).toBe(plainOutput)
    expect(existsSync(concivStateDir(root))).toBe(false)

    writeFileSync(concivStateDir(root), '')
    const unwritable = join(root, 'unwritable')
    await webpackBuild({
      mode: 'development',
      context: root,
      entry: './src/greeting.js',
      output: {path: unwritable},
      plugins: [concivWebpack()],
    })
    expect(readFileSync(join(unwritable, 'main.js'), 'utf8')).toBe(plainOutput)
  })

  test('a webpack development watch build boots the engine and adds the widget entry to every entry', async ({
    project,
    webpackWatch,
    freePort,
  }) => {
    const root = project('app')
    const port = await freePort()
    const stats = await webpackWatch({
      mode: 'development',
      context: root,
      entry: {first: './src/greeting.js', second: './src/greeting.js'},
      output: {path: join(root, 'dist')},
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
