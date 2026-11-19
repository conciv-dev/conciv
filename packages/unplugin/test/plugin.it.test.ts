import {tempDir} from '@conciv/vitest-config/temp-dir'
import {execFile, execFileSync} from 'node:child_process'
import {cp, mkdir, readdir, readFile, realpath, rm, writeFile} from 'node:fs/promises'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  cpSync,
  writeFileSync,
} from 'node:fs'
import {createServer as createHttpServer, type Server, type ServerResponse} from 'node:http'
import {createServer as createNetServer} from 'node:net'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {promisify} from 'node:util'
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished} from 'vitest'
import getPort from 'get-port'
import {z} from 'zod'
import {chromium, type Browser, type Page} from 'playwright'
import {expect as expectLocator} from 'playwright/test'
import webpack from 'webpack'
import {rspack} from '@rspack/core'
import {magicLink, recordedEngineBase} from '@conciv/harness-testkit/login'
import {makeRpcClient} from '@conciv/harness-testkit'
import {until} from '@conciv/harness-testkit/until'
import {DevTools} from '@vitejs/devtools'
import {devtools} from '@tanstack/devtools-vite'
import {createLogger, createServer, type Plugin, type PluginOption, type ViteDevServer} from 'vite'
import type {Engine} from '@conciv/core/start'
import type * as Bundler from '@conciv/plugin/schema/bundler'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {SessionCapturesSchema, type ToolCaptureRow} from '@conciv/protocol/element-capture-types'
import {readTrustedBrowsers} from '@conciv/protocol/engine-trust'
import {concivStateDir} from '@conciv/protocol/state-types'
import {rpcObserverFor} from '@conciv/plugin-testkit/rpc-observer'
import {rpcSocketFor} from '@conciv/plugin-testkit/rpc-socket'
import {createConcivUnplugin} from '../src/index.js'
import {installConcivBinShim} from '../src/core/bin-shim.js'
import {makeEngineBooter, type Builtins} from '../src/core/boot.js'
import {CONCIV_DEFAULT_PORT, register, withConciv} from '../src/core/nextjs.js'
import {makeViteBridge} from '../src/core/vite-bridge.js'
import {makeViteHook} from '../src/core/vite.js'
import {concivSolidConfig} from '../src/core/vite-plumbing.js'
import {type Middleware, makeWidgetInject} from '../src/core/widget-middleware.js'
import {WIDGET_ROUTE} from '../src/core/widget-module.js'
import {
  closeWhenTestFinishes,
  devServers,
  fixturePlugin,
  fixturePluginEntries,
  installConcivPackage,
  installFixturePlugin,
  magicLinkUrl,
  pageApiBase,
  startTestDevServer,
  testTempDir,
  type PluginEntries,
  type StartedDevServer,
} from './helpers/dev-servers.js'

const NAVIGATION_SET_PATH = ['navigation', 'set']
const PageTabsSchema = z.object({tabs: z.array(z.object({id: z.string()}))})

describe('bin shim', () => {
  describe('installConcivBinShim', () => {
    it('symlinks the agent-facing conciv shim to the cli package bin', () => {
      const stateDir = tempDir('conciv-bin-shim-')
      const agentPath = installConcivBinShim(stateDir)
      expect(agentPath.startsWith(join(stateDir, 'bin'))).toBe(true)
      const target = realpathSync(join(stateDir, 'bin', 'conciv'))
      expect(target.endsWith(join('packages', 'cli', 'dist', 'bin.js'))).toBe(true)
      const manifest = readFileSync(join(dirname(dirname(target)), 'package.json'), 'utf8')
      expect(manifest).toContain('"name": "@conciv/cli"')
    })

    it('leaves only .conciv/.gitignore visible to git in a fresh project', () => {
      const root = tempDir('conciv-bin-shim-git-')
      execFileSync('git', ['init', '--quiet'], {cwd: root})
      installConcivBinShim(concivStateDir(root))
      const untracked = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
        cwd: root,
        encoding: 'utf8',
      })
      expect(untracked).toBe('?? .conciv/.gitignore\n')
    })
  })
})

describe('bundler diagnostics', () => {
  const FIXTURE = fileURLToPath(new URL('./fixtures/diagnostics-app', import.meta.url))

  async function waitFor<T>(get: () => T | undefined, timeoutMs = 4000): Promise<T> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const value = get()
      if (value !== undefined) return value
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    throw new Error('timed out waiting for diagnostic')
  }

  describe('BundlerBridge diagnostic stream (IT, real vite dev server)', () => {
    const state = {server: undefined as ViteDevServer | undefined}
    afterEach(async () => {
      await state.server?.close()
      state.server = undefined
    })

    it('captures a real transform error and a real HMR file change through server.bundler.subscribe', async () => {
      const root = await realpath(tempDir('conciv-diag-'))
      await cp(FIXTURE, root, {recursive: true})
      await writeFile(join(root, 'broken.ts'), 'export const broken = = 1\n')
      const server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        server: {host: '127.0.0.1', port: 0},
      })
      state.server = server
      await server.listen()
      const address = server.httpServer?.address()
      const port = typeof address === 'object' && address ? address.port : 0
      const base = `http://127.0.0.1:${port}`

      const ring: Bundler.Diagnostic[] = []
      const bridge = makeViteBridge(server)
      const unsubscribe = bridge.subscribe?.((diagnostic) => ring.push(diagnostic))

      await fetch(`${base}/broken.ts`, {headers: {'sec-fetch-dest': 'script'}}).catch(() => undefined)
      const buildError = await waitFor(() => ring.find((diagnostic) => diagnostic.kind === 'build-error'))
      if (buildError.kind !== 'build-error') throw new Error('expected build-error diagnostic')
      expect(buildError.file).toContain('broken.ts')
      expect(buildError.message.length).toBeGreaterThan(0)
      expect(buildError.timestamp).toBeGreaterThan(0)

      await writeFile(join(root, 'good.ts'), `export const greeting = 'updated'\n`)
      await waitFor(() =>
        ring.find((diagnostic) => diagnostic.kind === 'hmr-update' && diagnostic.file === join(root, 'good.ts')),
      )

      const body = await fetch(`${base}/good.ts`, {headers: {'sec-fetch-dest': 'script'}}).then((r) => r.text())
      expect(body.length).toBeGreaterThan(0)
      const trace = await waitFor(() =>
        ring.find((diagnostic) => diagnostic.kind === 'request-trace' && diagnostic.url.startsWith('/good.ts')),
      )
      if (trace.kind !== 'request-trace') throw new Error('expected request-trace diagnostic')
      expect(trace.method).toBe('GET')
      expect(trace.status).toBeGreaterThan(0)
      expect(trace.durationMs).toBeGreaterThanOrEqual(0)
      expect(trace.timestamp).toBeGreaterThan(0)

      unsubscribe?.()
    })
  })
})

function holdPort(port: number): Promise<() => Promise<void>> {
  const blocker = createNetServer()
  return new Promise((resolve, reject) => {
    blocker.once('error', reject)
    blocker.listen(port, '127.0.0.1', () => resolve(() => new Promise<void>((done) => blocker.close(() => done()))))
  })
}

describe('engine port exact', () => {
  function tempRoot(): string {
    return tempDir('conciv-engine-port-exact-')
  }

  describe('makeEngineBooter with the exact port policy (Next.js and the generic webpack/rspack plugin)', () => {
    it('defaults to a port no outgoing socket can hold, outside the Linux and IANA ephemeral ranges', () => {
      expect(CONCIV_DEFAULT_PORT < 32768 || CONCIV_DEFAULT_PORT > 60999).toBe(true)
      expect(CONCIV_DEFAULT_PORT).toBeLessThan(49152)
    })

    it('boots on the requested fixed port', async () => {
      const root = tempRoot()
      let engine: Engine | undefined
      try {
        const port = await getPort()
        engine = await makeEngineBooter({port, stateRoot: root}, root, {}, 'exact')()
        expect(engine.port).toBe(port)
      } finally {
        await engine?.stop()
        rmSync(root, {recursive: true, force: true})
      }
    })

    it('fails loudly instead of silently landing on another port when the exact port is taken', async () => {
      const root = tempRoot()
      const taken = await getPort()
      const release = await holdPort(taken)
      try {
        await expect(makeEngineBooter({port: taken, stateRoot: root}, root, {}, 'exact')()).rejects.toMatchObject({
          code: 'EADDRINUSE',
        })
      } finally {
        await release()
        rmSync(root, {recursive: true, force: true})
      }
    })
  })
})

describe('webpack and rspack', () => {
  type Bundler = 'webpack' | 'rspack'
  type Mode = 'development' | 'production'
  type PluginOptions = {
    port?: number
    stateRoot: string
    enabled?: boolean
    widget?: false
    plugins?: PluginEntries
  }
  type BuildStats = {hasErrors: () => boolean; compilation: {fileDependencies: Iterable<string>}}
  type BuildHandler = (error: Error | null, stats?: BuildStats) => void
  type WatchingLike = {
    invalidate: (callback?: () => void) => void
    close: (callback: (error?: Error | null) => void) => void
  }
  type CompilerLike = {
    watch: (options: object, handler: BuildHandler) => WatchingLike | undefined
    run: (handler: BuildHandler) => void
    close: (callback: (error?: Error | null) => void) => void
  }
  type Watch = {next: () => Promise<string[]>; rebuild: () => Promise<string[]>; close: () => Promise<void>}
  type TestCompiler = {watch: () => Watch; run: () => Promise<string[]>; close: () => Promise<void>}

  const bundlers = ['webpack', 'rspack'] as const
  const generatedClient = (port: number) => join('.conciv', `widget-client.${String(port)}.gen.js`)
  const webpackCache = tempDir('conciv-webpack-cache-')

  function writeFixtureApp(root: string): string {
    const publicDir = join(root, 'public')
    mkdirSync(publicDir, {recursive: true})
    writeFileSync(join(root, 'index.js'), `document.body.append('fixture app')\n`)
    writeFileSync(
      join(publicDir, 'index.html'),
      '<!doctype html><html><head><meta charset="utf-8"><title>fixture</title></head><body><script src="/main.js"></script></body></html>',
    )
    return publicDir
  }

  function createBundlerCompiler(
    bundler: Bundler,
    root: string,
    mode: Mode,
    options: PluginOptions,
    cacheDirectory?: string,
  ): CompilerLike {
    const config: {
      context: string
      mode: Mode
      entry: string
      devtool: false
      output: {path: string; filename: string}
      infrastructureLogging: {level: 'none'}
    } = {
      context: root,
      mode,
      entry: './index.js',
      devtool: false,
      output: {path: join(root, 'public'), filename: 'main.js'},
      infrastructureLogging: {level: 'none'},
    }
    if (bundler === 'webpack') {
      return webpack({
        ...config,
        cache: {type: 'filesystem', cacheDirectory: cacheDirectory ?? webpackCache},
        plugins: [createConcivUnplugin().webpack(options)],
      })
    }
    if (cacheDirectory === undefined) return rspack({...config, plugins: [createConcivUnplugin().rspack(options)]})
    return rspack({
      ...config,
      cache: {type: 'persistent', storage: {type: 'filesystem', directory: cacheDirectory}},
      plugins: [createConcivUnplugin().rspack(options)],
    })
  }

  function settle(resolve: () => void, reject: (error: Error) => void) {
    return (error?: Error | null) => (error ? reject(error) : resolve())
  }

  function builtFiles(stats: BuildStats | undefined): string[] {
    if (stats === undefined) throw new Error('the build reported no stats')
    if (stats.hasErrors()) throw new Error('the build failed')
    return Array.from(stats.compilation.fileDependencies)
  }

  function testCompiler(
    bundler: Bundler,
    root: string,
    mode: Mode,
    options: PluginOptions,
    cacheDirectory?: string,
  ): TestCompiler {
    const compiler = createBundlerCompiler(bundler, root, mode, options, cacheDirectory)
    const closing: {watches: Array<() => Promise<void>>; compiler?: Promise<void>} = {watches: []}
    const close = () => {
      closing.compiler ??= Promise.all(closing.watches.map((closeWatch) => closeWatch())).then(
        () => new Promise<void>((resolve, reject) => compiler.close(settle(resolve, reject))),
      )
      return closing.compiler
    }
    onTestFinished(close)
    const run = () =>
      new Promise<string[]>((resolve, reject) =>
        compiler.run((error, stats) => {
          if (error) return reject(error)
          try {
            resolve(builtFiles(stats))
          } catch (failure) {
            reject(failure)
          }
        }),
      )
    const watch = (): Watch => {
      const builds: Array<PromiseWithResolvers<string[]>> = []
      const build = (index: number) => (builds[index] ??= Promise.withResolvers<string[]>())
      const counts = {done: 0, awaited: 0}
      const watching = compiler.watch({}, (error, stats) => {
        const settled = build(counts.done++)
        if (error) return settled.reject(error)
        try {
          settled.resolve(builtFiles(stats))
        } catch (failure) {
          settled.reject(failure)
        }
      })
      if (watching === undefined) throw new Error('the compiler did not start watching')
      const next = () => build(counts.awaited++).promise
      const stopped: {closed?: Promise<void>} = {}
      const closeWatch = () => {
        stopped.closed ??= new Promise<void>((resolve, reject) => watching.close(settle(resolve, reject)))
        return stopped.closed
      }
      closing.watches.push(closeWatch)
      return {
        next,
        rebuild: () => {
          watching.invalidate()
          return next()
        },
        close: closeWatch,
      }
    }
    return {watch, run, close}
  }

  function readWidgetClient(files: string[]): Promise<string> {
    const client = files.find((file) => file.includes('widget-client'))
    if (client === undefined) throw new Error('the build carries no widget client')
    return readFile(client, 'utf8')
  }

  function serveDirectory(dir: string): Promise<{url: string; close: () => Promise<void>}> {
    const server = createHttpServer((request, response) => {
      const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
      const file = join(dir, path === '/' ? 'index.html' : path)
      readFile(file).then(
        (body) => {
          response.writeHead(200, {
            'content-type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript',
          })
          response.end(body)
        },
        () => {
          response.writeHead(404)
          response.end()
        },
      )
    })
    return new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (address === null || typeof address === 'string') return reject(new Error('the static server has no port'))
        resolve({
          url: `http://127.0.0.1:${address.port}/`,
          close: () => new Promise<void>((done) => server.close(() => done())),
        })
      })
    })
  }

  async function health(port: number): Promise<boolean> {
    return fetch(`http://127.0.0.1:${port}/health`).then(
      (response) => response.ok,
      () => false,
    )
  }

  describe('the widget on the page of a development build', () => {
    const state: {browser?: Browser} = {}

    beforeAll(async () => {
      state.browser = await chromium.launch({headless: true})
    })

    afterAll(async () => {
      await state.browser?.close()
    })

    async function openPage(): Promise<Page> {
      const page = await state.browser?.newPage()
      if (page === undefined) throw new Error('the browser did not start')
      onTestFinished(() => page.close())
      return page
    }

    it.each(bundlers)(
      '%s watching puts the launcher on the page, and the widget unlocks against the engine',
      async (bundler) => {
        const root = testTempDir(`conciv-${bundler}-widget-`)
        const publicDir = writeFixtureApp(root)
        const port = await getPort()
        const compiler = testCompiler(bundler, root, 'development', {port, stateRoot: root})
        const watch = compiler.watch()
        await watch.next()
        expect(await health(port)).toBe(true)
        const site = await serveDirectory(publicDir)
        onTestFinished(site.close)

        const page = await openPage()
        await page.goto(await magicLink(recordedEngineBase(root), site.url), {waitUntil: 'domcontentloaded'})
        await expectLocator(page.getByText('fixture app')).toBeVisible()
        const launcher = page.getByRole('button', {name: 'Open conciv chat'})
        await expectLocator(launcher).toBeVisible()
        await launcher.click()
        const chat = page.getByRole('dialog', {name: 'conciv chat agent'})
        await expectLocator(chat.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
        expect(await page.getByRole('button', {name: /Authorize conciv/}).count()).toBe(0)
      },
      60_000,
    )

    it.each(bundlers)(
      `%s without a port bakes the default engine port ${CONCIV_DEFAULT_PORT} into the widget client`,
      async (bundler) => {
        const root = testTempDir(`conciv-${bundler}-default-port-`)
        writeFixtureApp(root)
        const compiler = testCompiler(bundler, root, 'development', {stateRoot: root})
        expect(await compiler.run()).toContain(join(root, generatedClient(CONCIV_DEFAULT_PORT)))
        const generated = await readFile(join(root, generatedClient(CONCIV_DEFAULT_PORT)), 'utf8')
        expect(generated).not.toContain(fileURLToPath(new URL('..', import.meta.url)))
        expect(generated).not.toContain('/dist/')
        expect(generated).toContain(`startConcivWidget(${CONCIV_DEFAULT_PORT})`)
      },
      60_000,
    )

    it.each(bundlers)(
      '%s compilers sharing a context with two ports each build a client with their own port',
      async (bundler) => {
        const root = testTempDir(`conciv-${bundler}-two-ports-`)
        writeFixtureApp(root)
        const firstPort = await getPort()
        const secondPort = await getPort({exclude: [firstPort]})
        const first = testCompiler(bundler, root, 'development', {port: firstPort, stateRoot: root})
        const second = testCompiler(bundler, root, 'development', {port: secondPort, stateRoot: root})
        const firstFiles = await first.run()
        const secondFiles = await second.run()
        expect(await readWidgetClient(firstFiles)).toContain(`startConcivWidget(${String(firstPort)})`)
        expect(await readWidgetClient(secondFiles)).toContain(`startConcivWidget(${String(secondPort)})`)
      },
      60_000,
    )

    it.each(bundlers)(
      '%s with a port opens the widget socket at that port',
      async (bundler) => {
        const root = testTempDir(`conciv-${bundler}-socket-port-`)
        const publicDir = writeFixtureApp(root)
        const port = await getPort()
        const compiler = testCompiler(bundler, root, 'development', {port, stateRoot: root})
        await compiler.run()
        const site = await serveDirectory(publicDir)
        onTestFinished(site.close)

        const page = await openPage()
        const engineSocket = Promise.withResolvers<string>()
        page.on('websocket', (socket) => engineSocket.resolve(socket.url()))
        await page.goto(site.url, {waitUntil: 'domcontentloaded'})
        expect(new URL(await engineSocket.promise).host).toBe(`127.0.0.1:${port}`)
      },
      60_000,
    )
  })

  describe('a build that carries no widget and starts no engine', () => {
    it.each(bundlers)(
      '%s production watching',
      async (bundler) => {
        const root = testTempDir(`conciv-${bundler}-production-`)
        writeFixtureApp(root)
        const port = await getPort()
        const compiler = testCompiler(bundler, root, 'production', {port, stateRoot: root})
        const watch = compiler.watch()
        const files = await watch.next()
        expect(files).toContain(join(root, 'index.js'))
        expect(files.some((file) => file.includes('widget-client'))).toBe(false)
        expect(existsSync(join(root, generatedClient(port)))).toBe(false)
        expect(await health(port)).toBe(false)
        expect(existsSync(join(concivStateDir(root), 'server.json'))).toBe(false)
        await watch.close()
        await compiler.close()
      },
      60_000,
    )

    it.each(bundlers)(
      '%s production run',
      async (bundler) => {
        const root = testTempDir(`conciv-${bundler}-production-run-`)
        writeFixtureApp(root)
        const port = await getPort()
        const compiler = testCompiler(bundler, root, 'production', {port, stateRoot: root})
        const files = await compiler.run()
        expect(files).toContain(join(root, 'index.js'))
        expect(files.some((file) => file.includes('widget-client'))).toBe(false)
        expect(await health(port)).toBe(false)
        await compiler.close()
      },
      60_000,
    )

    it.each(bundlers)(
      '%s development watching with enabled: false',
      async (bundler) => {
        const root = testTempDir(`conciv-${bundler}-disabled-`)
        writeFixtureApp(root)
        const port = await getPort()
        const compiler = testCompiler(bundler, root, 'development', {port, stateRoot: root, enabled: false})
        const watch = compiler.watch()
        const files = await watch.next()
        expect(files).toContain(join(root, 'index.js'))
        expect(files.some((file) => file.includes('widget-client'))).toBe(false)
        expect(existsSync(join(root, '.conciv'))).toBe(false)
        expect(await health(port)).toBe(false)
        expect(existsSync(join(concivStateDir(root), 'server.json'))).toBe(false)
        await watch.close()
        await compiler.close()
      },
      60_000,
    )
  })

  describe('a development build with widget: false', () => {
    it.each(bundlers)(
      '%s watching carries no widget and still starts the engine',
      async (bundler) => {
        const root = testTempDir(`conciv-${bundler}-no-widget-`)
        writeFixtureApp(root)
        const port = await getPort()
        const compiler = testCompiler(bundler, root, 'development', {port, stateRoot: root, widget: false})
        const watch = compiler.watch()
        const files = await watch.next()
        expect(files).toContain(join(root, 'index.js'))
        expect(files.some((file) => file.includes('widget-client'))).toBe(false)
        expect(existsSync(join(root, generatedClient(port)))).toBe(false)
        expect(await health(port)).toBe(true)
        expect(JSON.parse(readFileSync(join(concivStateDir(root), 'server.json'), 'utf8'))).toMatchObject({port})
        await watch.close()
        await compiler.close()
      },
      60_000,
    )
  })

  describe('a second dev run on another port, on the same persistent cache', () => {
    const widgetStartCall = (port: number) => new RegExp(`startConcivWidget\\)?\\(${String(port)}\\)`)

    it.each(bundlers)(
      '%s builds the new port into the page and rebuilds after a save',
      async (bundler) => {
        const root = testTempDir(`conciv-${bundler}-port-change-`)
        const publicDir = writeFixtureApp(root)
        const emittedScripts = async () =>
          (await readdir(publicDir)).filter((file) => file.endsWith('.js')).map((file) => join(publicDir, file))
        const cacheDirectory = join(root, 'node_modules', '.cache', bundler)
        const firstPort = await getPort()
        const secondPort = await getPort({exclude: [firstPort]})
        const first = testCompiler(bundler, root, 'development', {port: firstPort, stateRoot: root}, cacheDirectory)
        const firstWatch = first.watch()
        expect(await readWidgetClient(await firstWatch.next())).toContain(`startConcivWidget(${String(firstPort)})`)
        await firstWatch.close()
        await first.close()
        for (const file of await emittedScripts()) rmSync(file)

        const second = testCompiler(bundler, root, 'development', {port: secondPort, stateRoot: root}, cacheDirectory)
        const secondWatch = second.watch()
        const files = await secondWatch.next()
        expect(files).toContain(join(root, generatedClient(secondPort)))
        expect(files).not.toContain(join(root, generatedClient(firstPort)))
        const bundle = (await Promise.all((await emittedScripts()).map((file) => readFile(file, 'utf8')))).join('\n')
        expect(bundle).toMatch(widgetStartCall(secondPort))
        expect(bundle).not.toMatch(widgetStartCall(firstPort))

        appendFileSync(join(root, 'index.js'), `console.log('saved')\n`)
        await expect(secondWatch.next()).resolves.toContain(join(root, 'index.js'))
        await secondWatch.close()
        await second.close()
      },
      60_000,
    )
  })

  describe('the engine follows the watcher', () => {
    it.each(bundlers)(
      '%s starts the engine on the first watch run only, and stops it when watching closes',
      async (bundler) => {
        const root = testTempDir(`conciv-${bundler}-hook-`)
        writeFixtureApp(root)
        const serverFile = join(concivStateDir(root), 'server.json')
        const port = await getPort()
        const compiler = testCompiler(bundler, root, 'development', {port, stateRoot: root})
        expect(existsSync(serverFile)).toBe(false)

        const watch = compiler.watch()
        await watch.next()
        expect(await health(port)).toBe(true)
        const recorded = readFileSync(serverFile, 'utf8')
        expect(JSON.parse(recorded)).toMatchObject({port})
        await watch.rebuild()
        expect(readFileSync(serverFile, 'utf8')).toBe(recorded)
        expect(await health(port)).toBe(true)

        await watch.close()
        await compiler.close()
        expect(await health(port)).toBe(false)
      },
      60_000,
    )

    it.each(bundlers)(
      '%s compiler close settles only after the engine has stopped',
      async (bundler) => {
        const root = testTempDir(`conciv-${bundler}-close-`)
        writeFixtureApp(root)
        const port = await getPort()
        const compiler = testCompiler(bundler, root, 'development', {
          port,
          stateRoot: root,
          plugins: fixturePlugin(join(concivStateDir(root), 'fixture-disposed')),
        })
        const watch = compiler.watch()
        await watch.next()
        expect(await health(port)).toBe(true)

        await watch.close()
        await compiler.close()
        expect(existsSync(join(concivStateDir(root), 'fixture-disposed'))).toBe(true)
        expect(await health(port)).toBe(false)
      },
      60_000,
    )

    it.each(bundlers)(
      '%s watching again after watching closed boots a new engine, after the old one has stopped',
      async (bundler) => {
        const root = testTempDir(`conciv-${bundler}-rewatch-`)
        writeFixtureApp(root)
        const disposed = join(concivStateDir(root), 'fixture-disposed')
        const port = await getPort()
        const compiler = testCompiler(bundler, root, 'development', {
          port,
          stateRoot: root,
          plugins: fixturePlugin(join(concivStateDir(root), 'fixture-disposed')),
        })
        const first = compiler.watch()
        await first.next()
        expect(await health(port)).toBe(true)

        await first.close()
        const second = compiler.watch()
        await second.next()
        expect(existsSync(disposed)).toBe(true)
        expect(await health(port)).toBe(true)

        rmSync(disposed)
        await second.close()
        const third = compiler.watch()
        await third.next()
        expect(existsSync(disposed)).toBe(true)
        expect(await health(port)).toBe(true)

        await third.close()
        await compiler.close()
        expect(await health(port)).toBe(false)
      },
      60_000,
    )

    it.each(bundlers)(
      '%s keeps watching without an engine when the configured port is taken',
      async (bundler) => {
        const root = testTempDir(`conciv-${bundler}-taken-`)
        writeFixtureApp(root)
        const taken = await getPort()
        const release = await holdPort(taken)
        onTestFinished(release)
        const compiler = testCompiler(bundler, root, 'development', {port: taken, stateRoot: root})
        const watch = compiler.watch()
        await expect(watch.next()).resolves.toContain(join(root, 'index.js'))
        await expect(watch.rebuild()).resolves.toContain(join(root, 'index.js'))
        expect(existsSync(join(concivStateDir(root), 'server.json'))).toBe(false)
        await expect(watch.close()).resolves.toBeUndefined()
        await expect(compiler.close()).resolves.toBeUndefined()
      },
      60_000,
    )

    it.each(bundlers)(
      '%s keeps watching without an engine when the conciv state folder cannot be created',
      async (bundler) => {
        const root = testTempDir(`conciv-${bundler}-unwritable-`)
        writeFixtureApp(root)
        const stateRoot = join(root, 'a-file-not-a-folder')
        writeFileSync(stateRoot, '')
        const port = await getPort()
        const compiler = testCompiler(bundler, root, 'development', {port, stateRoot})
        const watch = compiler.watch()
        await expect(watch.next()).resolves.toContain(join(root, 'index.js'))
        expect(await health(port)).toBe(false)
        await expect(watch.close()).resolves.toBeUndefined()
        await expect(compiler.close()).resolves.toBeUndefined()
      },
      60_000,
    )
  })

  describe('a development watch that cannot add the widget', () => {
    const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))
    const RESULT_PREFIX = 'watch-once '
    const WATCH_ONCE = `
const [bundler, root, port, stateRoot] = process.argv.slice(1)
const plugin = (await import('@conciv/unplugin/' + bundler)).default
const config = {
  context: root,
  mode: 'development',
  entry: './index.js',
  devtool: false,
  output: {path: root + '/public', filename: 'main.js'},
  infrastructureLogging: {level: 'none'},
  plugins: [plugin({port: Number(port), stateRoot})],
}
const compiler = bundler === 'webpack' ? (await import('webpack')).default(config) : (await import('@rspack/core')).rspack(config)
const watching = compiler.watch({}, async (error, stats) => {
  const engine = await fetch('http://127.0.0.1:' + port + '/health').then((response) => response.ok, () => false)
  const result = {
    error: error ? error.message : null,
    failed: stats ? stats.hasErrors() : true,
    files: stats ? Array.from(stats.compilation.fileDependencies) : [],
    engine,
  }
  watching.close(() => compiler.close(() => console.log('${RESULT_PREFIX}' + JSON.stringify(result))))
})
`
    const WatchOnceSchema = z.object({
      error: z.string().nullable(),
      failed: z.boolean(),
      files: z.array(z.string()),
      engine: z.boolean(),
    })
    const runNode = promisify(execFile)

    async function watchOnce(bundler: Bundler, root: string, port: number, stateRoot: string) {
      const {stdout, stderr} = await runNode(
        process.execPath,
        ['--input-type=module', '-e', WATCH_ONCE, bundler, root, String(port), stateRoot],
        {cwd: PACKAGE_ROOT, encoding: 'utf8', timeout: 50_000},
      )
      const line = stdout.split('\n').find((entry) => entry.startsWith(RESULT_PREFIX))
      if (line === undefined) throw new Error(`the watch printed no result\n${stdout}\n${stderr}`)
      const logged = stderr.split('\n').filter((entry) => entry.startsWith('conciv:'))
      return {...WatchOnceSchema.parse(JSON.parse(line.slice(RESULT_PREFIX.length))), logged}
    }

    it.each(bundlers)(
      '%s builds without the widget and still starts the engine when .conciv is a file',
      async (bundler) => {
        const root = testTempDir(`conciv-${bundler}-conciv-file-`)
        writeFixtureApp(root)
        writeFileSync(join(root, '.conciv'), '')
        const stateRoot = testTempDir(`conciv-${bundler}-conciv-file-state-`)
        const port = await getPort()
        const run = await watchOnce(bundler, root, port, stateRoot)
        expect(run.error).toBeNull()
        expect(run.failed).toBe(false)
        expect(run.files).toContain(join(root, 'index.js'))
        expect(run.files.some((file) => file.includes('widget-client'))).toBe(false)
        expect(run.engine).toBe(true)
        const clientLine = run.logged.find((entry) => entry.includes(join(root, generatedClient(port))))
        expect(clientLine).toContain('EEXIST')
      },
      60_000,
    )

    it.each(bundlers)(
      '%s builds without the widget when the port is not an engine port',
      async (bundler) => {
        const root = testTempDir(`conciv-${bundler}-bad-port-`)
        writeFixtureApp(root)
        const run = await watchOnce(bundler, root, 70_000, root)
        expect(run.error).toBeNull()
        expect(run.failed).toBe(false)
        expect(run.files).toContain(join(root, 'index.js'))
        expect(run.files.some((file) => file.includes('widget-client'))).toBe(false)
        expect(existsSync(join(root, generatedClient(70_000)))).toBe(false)
        expect(run.logged).toContain(
          'conciv: the engine port must be an integer from 1 to 65535, got 70000, so the page gets no widget',
        )
      },
      60_000,
    )
  })
})

describe('engine port fallback', () => {
  describe('two dev servers configured with the same engine port', () => {
    const servers = devServers()

    afterEach(() => servers.stopAll())

    it('both boot, and the second page points at the engine that is actually listening for it', async () => {
      const preferred = await getPort()
      const first = await servers.start({widget: false, port: preferred})
      expect(await pageApiBase(first.server)).toBe(`http://127.0.0.1:${preferred}`)

      const second = await servers.start({widget: false, port: preferred})
      const secondBase = await pageApiBase(second.server)
      expect(secondBase).not.toBe(`http://127.0.0.1:${preferred}`)
      expect((await fetch(`${secondBase}/health`)).ok).toBe(true)
      expect((await fetch(`http://127.0.0.1:${preferred}/health`)).ok).toBe(true)
    }, 60_000)
  })
})

describe('dev server close', () => {
  const servers = devServers()

  afterEach(() => servers.stopAll())

  it('settles only after the engine has stopped', async () => {
    const root = servers.tempDir('conciv-vite-root-')
    const started = await servers.start(
      {widget: false, plugins: fixturePlugin(join(concivStateDir(root), 'fixture-disposed'))},
      {},
      root,
    )
    const apiBase = await pageApiBase(started.server)
    expect((await fetch(`${apiBase}/health`)).ok).toBe(true)

    await started.server.close()
    expect(existsSync(join(concivStateDir(started.root), 'fixture-disposed'))).toBe(true)
    await expect(fetch(`${apiBase}/health`)).rejects.toThrow()
  }, 30_000)
})

describe('source picks on a real host', () => {
  const dirs = devServers()
  const servers: ViteDevServer[] = []
  const grabModule = fileURLToPath(import.meta.resolve('@conciv/plugin-testkit/host/grab'))
  const home = process.cwd()
  let browser: Browser

  const hostFiles = (): Record<string, string> => ({
    'index.html':
      '<!doctype html><meta charset="utf-8"><title>host</title><script type="module" src="/src/main.tsx"></script>',
    'src/h.ts': [
      'export function h(tag: unknown, props: Record<string, unknown> | null, ...children: unknown[]): Node {',
      '  if (typeof tag === "function") return tag({...props, children})',
      '  const element = document.createElement(String(tag))',
      '  for (const [name, value] of Object.entries(props ?? {})) if (typeof value === "string") element.setAttribute(name, value)',
      '  element.append(...children.flat().map((child) => (child instanceof Node ? child : String(child))))',
      '  return element',
      '}',
    ].join('\n'),
    'src/Card.tsx':
      'import {h} from "./h"\nexport const Card = (props: {title: string}) => (\n  <section>\n    <h2>{props.title}</h2>\n  </section>\n)\n',
    'src/App.tsx':
      'import {h} from "./h"\nimport {Card} from "./Card"\nexport const App = () => (\n  <main>\n    <p>Pick me</p>\n    <Card title="Plans" />\n  </main>\n)\n',
    'src/main.tsx': [
      `import {makeHostGrab} from ${JSON.stringify(grabModule)}`,
      'import {App} from "./App"',
      'document.body.append(App())',
      'const grab = makeHostGrab(document)',
      'const next = (): Promise<void> => grab.pick().then((picked) => {',
      '  const html = picked?.preview.kind === "dom" ? picked.preview.html : ""',
      '  const line = `Picked ${picked?.source?.filePath}:${picked?.source?.lineNumber} ${html.slice(0, html.indexOf(">") + 1)}`',
      '  document.body.append(Object.assign(document.createElement("pre"), {textContent: line}))',
      '  return next()',
      '})',
      'void next()',
    ].join('\n'),
  })

  async function startHost(withDevtools: boolean): Promise<string> {
    const root = realpathSync(dirs.tempDir('conciv-pick-'))
    for (const [path, text] of Object.entries(hostFiles())) {
      mkdirSync(dirname(join(root, path)), {recursive: true})
      writeFileSync(join(root, path), text)
    }
    process.chdir(root)
    const server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      server: {host: '127.0.0.1', port: 0, fs: {strict: false}},
      oxc: {jsx: {runtime: 'classic', pragma: 'h', development: false}},
      plugins: [
        ...(withDevtools ? devtools({eventBusConfig: {enabled: false}, enhancedLogs: {enabled: false}}) : []),
        makeViteHook({enabled: true, stateRoot: root, widget: false}),
      ],
    })
    servers.push(server)
    await server.listen()
    const address = server.httpServer?.address()
    return `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/`
  }

  async function expectPick(url: string, click: string, picked: string): Promise<void> {
    const page = await browser.newPage()
    await page.goto(url, {waitUntil: 'domcontentloaded'})
    await page.getByText(click, {exact: true}).click()
    await expectLocator(page.getByText(/^Picked /)).toHaveText(picked)
    await page.close()
  }

  beforeAll(async () => {
    browser = await chromium.launch({headless: true})
  })
  afterAll(async () => {
    process.chdir(home)
    await browser.close()
    await Promise.all(servers.map((server) => server.close()))
    await dirs.stopAll()
  })

  it('picks a host element at the file and line it is written at, and a component element at its own file', async () => {
    const url = await startHost(false)
    await expectPick(url, 'Pick me', 'Picked /src/App.tsx:5 <p data-tsd-source="/src/App.tsx:5:5">')
    await expectPick(url, 'Plans', 'Picked /src/Card.tsx:4 <h2 data-tsd-source="/src/Card.tsx:4:5">')
  }, 60_000)

  it('stamps each element once when the host also runs the @tanstack/devtools source injector', async () => {
    const url = await startHost(true)
    await expectPick(url, 'Pick me', 'Picked /src/App.tsx:5 <p data-tsd-source="/src/App.tsx:5:5">')
  }, 60_000)
})

describe('native page vite boot', () => {
  const NATIVE_BUNDLE = 'conciv-widget-native.global.js'
  const INTEROP_ERROR = /SyntaxError|does not provide an export named/

  describe('dev core booted through the vite plugin', () => {
    const servers = devServers()

    afterEach(() => servers.stopAll())

    it('serves /native because configureServer threads the native page dir into the engine', async () => {
      const nativeDir = servers.tempDir('conciv-vite-native-')
      const endpointDir = servers.tempDir('conciv-vite-endpoint-')
      writeFileSync(join(nativeDir, NATIVE_BUNDLE), 'globalThis.__conciv_native_loaded = true')

      const {server} = await servers.start({widget: false, devEndpointDir: endpointDir}, {nativePageDir: nativeDir})

      const apiBase = await pageApiBase(server, '/native')
      const page = await fetch(`${apiBase}/native`)
      expect(page.status).toBe(200)
      const html = await page.text()
      expect(html).toContain('data-conciv-native-root')
      expect(html).toContain(`native/${NATIVE_BUNDLE}`)
      expect(existsSync(join(endpointDir, 'dev-endpoint.json'))).toBe(true)
    }, 30_000)
  })

  describe('widget boot in a host that installs conciv under node_modules and a plugin in conciv/plugins, with no optimizeDeps.include', () => {
    const servers = devServers()
    const state: {started?: StartedDevServer; browser?: Browser; page?: Page; errors: string[]} = {errors: []}

    beforeAll(async () => {
      const root = servers.tempDir('conciv-vite-installed-')
      writeFileSync(
        join(root, 'index.html'),
        '<!doctype html><html><head><meta charset="utf-8"></head><body><p id="probe">probe</p><button id="counter" onclick="this.textContent = String(Number(this.textContent) + 1)">0</button></body></html>',
      )
      const embedDir = installConcivPackage(root, '@conciv/embed')
      installFixturePlugin(root)
      state.started = await servers.start(
        {devEndpointDir: servers.tempDir('conciv-vite-endpoint-')},
        {
          embedEntry: join(embedDir, 'dist', 'mount.js'),
        },
        root,
      )
      state.browser = await chromium.launch({headless: true})
      state.page = await state.browser.newPage()
      await rpcSocketFor(state.page).installed
      state.page.on('console', (message) => {
        if (message.type() === 'error') state.errors.push(message.text())
      })
      state.page.on('pageerror', (error) => state.errors.push(error.message))
    }, 90_000)

    afterAll(async () => {
      await state.browser?.close()
      await servers.stopAll()
    })

    const trustedUrl = async (): Promise<string> => {
      const started = state.started
      const url = started?.server.resolvedUrls?.local[0]
      if (started === undefined || url === undefined) throw new Error('dev server did not start')
      return magicLinkUrl(started, url)
    }

    const openChat = async (page: Page): Promise<void> => {
      await rpcSocketFor(page).installed
      await page.goto(await trustedUrl(), {waitUntil: 'domcontentloaded'})
      await page.getByRole('button', {name: /conciv chat$/}).click()
      await page.getByRole('dialog', {name: 'conciv chat agent'}).waitFor({timeout: 15_000})
      await page.getByRole('textbox', {name: 'Message the conciv agent'}).waitFor({timeout: 15_000})
    }

    const importSettled = (page: Page, href: string) =>
      page.evaluate(`import(${JSON.stringify(href)}).then(() => null, () => null)`)

    const engineRpc = (headers: Record<string, string> = {}) => {
      const started = state.started
      if (started === undefined) throw new Error('dev server did not start')
      return makeRpcClient(recordedEngineBase(started.root), {headers})
    }

    const pageMethod = (method: string, sessionId: string) =>
      engineRpc().plugin.call({rpcId: 'experimental.page', method, input: {sessionId}})

    const tabIds = async (sessionId: string) =>
      PageTabsSchema.parse(await pageMethod('tabs.list', sessionId)).tabs.map((tab) => tab.id)

    const afterRows = async (sessionId: string) =>
      SessionCapturesSchema.parse(await pageMethod('captures.list', sessionId)).captures.filter(
        (row) => row.kind === 'after',
      )

    const pageTabWatch = async () => {
      const {sessionId} = await engineRpc().sessions.resolve({})
      const before = await tabIds(sessionId)
      const attached = async () => {
        const found: {tabId: string | undefined} = {tabId: undefined}
        await until(
          async () => {
            found.tabId = (await tabIds(sessionId)).find((tabId) => !before.includes(tabId))
            return found.tabId !== undefined
          },
          {hangGuardMs: 30_000, intervalMs: 100},
        )
        if (found.tabId === undefined) throw new Error('the page never attached a tab to the session')
        return {sessionId, tabId: found.tabId}
      }
      return {attached}
    }

    type PageTarget = {sessionId: string; tabId: string}

    const pageTool = (target: PageTarget, name: string, input: Record<string, unknown>) =>
      engineRpc({[CONCIV_SESSION_HEADER]: target.sessionId}).registry.call({
        name,
        input: {...input, tabId: target.tabId},
      })

    const newAfterCapture = async (sessionId: string, known: readonly ToolCaptureRow[]) => {
      const row = (await afterRows(sessionId)).find(
        (entry) => !known.some((seen) => seen.toolCallId === entry.toolCallId),
      )
      if (row === undefined) throw new Error('the page tool stored no after capture')
      return row.capture
    }

    const runPageTool = async (target: PageTarget, name: string, input: Record<string, unknown>) => {
      const known = await afterRows(target.sessionId)
      const output = await pageTool(target, name, input)
      return {output, capture: await newAfterCapture(target.sessionId, known)}
    }

    it('mounts the widget without a CommonJS interop error', async () => {
      const page = state.page
      if (page === undefined) throw new Error('dev server did not start')
      const url = await trustedUrl()
      const failure = Promise.withResolvers<string>()
      page.on('console', (message) => {
        if (message.type() === 'error' && message.text().startsWith('[conciv]')) failure.resolve(message.text())
      })
      await page.goto(url, {waitUntil: 'domcontentloaded'})
      const mounted = page
        .getByRole('button', {name: /conciv chat$/})
        .waitFor({timeout: 45_000})
        .then(
          () => 'mounted',
          () => 'not mounted',
        )
      const outcome = await Promise.race([mounted, failure.promise])
      expect(outcome).toBe('mounted')
      expect(state.errors.filter((error) => INTEROP_ERROR.test(error))).toEqual([])
    }, 60_000)

    it('opens the panel with the composer, so the embed shares the host Solid and plugin singletons', async () => {
      const page = state.page
      if (page === undefined) throw new Error('dev server did not start')
      await openChat(page)
      expect(state.errors).toEqual([])
      const saves = rpcObserverFor(page)
      const beforeMinimize = saves.mark()
      await page.getByRole('textbox', {name: 'Message the conciv agent'}).press('Escape')
      await saves.completed({path: NAVIGATION_SET_PATH, input: /^(?!.*open=true)/, since: beforeMinimize})
    }, 30_000)

    it('restores the open chat, keeps it usable and names the content blocker when every rrweb module is blocked', async () => {
      const opener = await state.browser?.newPage()
      if (opener === undefined) throw new Error('dev server did not start')
      onTestFinished(() => opener.close())
      const saves = rpcObserverFor(opener)
      const beforeOpen = saves.mark()
      await openChat(opener)
      await saves.completed({path: NAVIGATION_SET_PATH, input: /open=true/, since: beforeOpen})
      await opener.close()
      const url = await trustedUrl()
      const tabWatch = await pageTabWatch()
      const blockedPage = await state.browser?.newPage()
      if (blockedPage === undefined) throw new Error('dev server did not start')
      onTestFinished(() => blockedPage.close())
      await blockedPage.route(/rrweb/, (route) => route.abort('blockedbyclient'))
      await blockedPage.goto(url, {waitUntil: 'domcontentloaded'})
      const blockerNotice = blockedPage.getByText(/content blocker.*rrweb-snapshot/)
      await expectLocator(blockerNotice).toBeVisible({timeout: 45_000})
      const chat = blockedPage.getByRole('dialog', {name: 'conciv chat agent'})
      const composer = chat.getByRole('textbox', {name: 'Message the conciv agent'})
      await composer.fill('still usable', {timeout: 45_000})
      await expectLocator(composer).toHaveText('still usable')
      await chat.getByRole('tab', {name: 'Fixture'}).click()
      await expectLocator(chat.getByText('The fixture plugin view')).toBeVisible()
      await expectLocator(blockerNotice).toBeHidden()
      const target = await tabWatch.attached()
      const stillBlocked = blockedPage.waitForEvent('requestfailed', (request) => /rrweb-snapshot/.test(request.url()))
      const outcome = await runPageTool(target, 'page_settext', {selector: '#probe', text: 'rewritten'})
      expect(outcome.output).toMatchObject({ok: true})
      expect(outcome.capture).toMatchObject({descriptor: {accessibleName: 'rewritten'}})
      expect(outcome.capture.node).toBeUndefined()
      await importSettled(blockedPage, (await stillBlocked).url())
      expect(await blockerNotice.count()).toBe(0)
    }, 90_000)

    it('runs a page tool once and promptly while rrweb-snapshot is still loading', async () => {
      const url = await trustedUrl()
      const tabWatch = await pageTabWatch()
      const slowPage = await state.browser?.newPage()
      if (slowPage === undefined) throw new Error('dev server did not start')
      await slowPage.route(/rrweb-snapshot/, () => new Promise<void>(() => {}))
      await slowPage.goto(url, {waitUntil: 'domcontentloaded'})
      await slowPage.getByRole('button', {name: /conciv chat$/}).waitFor({timeout: 45_000})
      const target = await tabWatch.attached()
      const known = await afterRows(target.sessionId)
      const output = await Promise.race([
        pageTool(target, 'page_click', {selector: '#counter'}),
        new Promise((resolve) => setTimeout(() => resolve('still waiting'), 2_000)),
      ])
      expect(output).toMatchObject({ok: true})
      const capture = await newAfterCapture(target.sessionId, known)
      expect(capture).toMatchObject({descriptor: {tagName: 'button'}})
      expect(capture.node).toBeUndefined()
      await expectLocator(slowPage.getByRole('button', {name: '1', exact: true})).toBeVisible()
      await slowPage.close()
    }, 90_000)

    it('retries a failed rrweb-snapshot load on the next page tool and names the content blocker once', async () => {
      const url = await trustedUrl()
      const tabWatch = await pageTabWatch()
      const blockedPage = await state.browser?.newPage()
      if (blockedPage === undefined) throw new Error('dev server did not start')
      const gate = {open: false}
      await blockedPage.route(/rrweb-snapshot/, (route) =>
        gate.open ? route.continue() : route.abort('blockedbyclient'),
      )
      await blockedPage.goto(url, {waitUntil: 'domcontentloaded'})
      const blockerNotice = blockedPage.getByText(/content blocker.*rrweb-snapshot/)
      await expectLocator(blockerNotice).toBeVisible({timeout: 45_000})
      await expectLocator(blockerNotice).toBeHidden()
      const target = await tabWatch.attached()
      const rewrite = () => runPageTool(target, 'page_settext', {selector: '#probe', text: 'rewritten'})

      const stillBlocked = blockedPage.waitForEvent('requestfailed', (request) => /rrweb-snapshot/.test(request.url()))
      expect((await rewrite()).capture.node).toBeUndefined()
      const failedImport = (await stillBlocked).url()
      await importSettled(blockedPage, failedImport)
      expect(await blockerNotice.count()).toBe(0)

      gate.open = true
      const unblocked = blockedPage.waitForResponse(/rrweb-snapshot/)
      await rewrite()
      const loadedImport = (await unblocked).url()
      await importSettled(blockedPage, loadedImport)
      expect((await rewrite()).capture.node).toBeDefined()
      await blockedPage.close()
    }, 90_000)
  })
})

describe('nextjs config', () => {
  const ENV_KEYS = ['NEXT_PUBLIC_CONCIV_PORT', 'CONCIV_OPTIONS', 'NEXT_RUNTIME'] as const

  type WebpackConfig = {resolve?: {alias?: Record<string, string | false>}}

  const savedEnv: Record<string, string | undefined> = {}
  let originalCwd = ''
  let projectRoot = ''

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
    originalCwd = process.cwd()
    projectRoot = tempDir('conciv-nextcfg-')
    process.chdir(projectRoot)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(projectRoot, {recursive: true, force: true})
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key]
      else process.env[key] = savedEnv[key]
    }
  })

  describe('withConciv bundler aliasing', () => {
    it('composes a webpack hook that still runs the user hook on the config it returns', () => {
      const seen: WebpackConfig[] = []
      const userWebpack = (config: WebpackConfig): WebpackConfig => {
        seen.push(config)
        return config
      }
      const cfg = withConciv({webpack: userWebpack})
      const config: WebpackConfig = {resolve: {alias: {}}}
      const out = cfg.webpack?.(config, {})
      expect(seen).toHaveLength(1)
      expect(out).toBe(seen[0])
    })

    it('stubs the engine register entries to false in the edge compilation so node-only code is never bundled for edge', () => {
      const cfg = withConciv({})
      const edge = cfg.webpack?.({resolve: {alias: {}}}, {nextRuntime: 'edge'})
      expect(edge?.resolve?.alias?.['@conciv/it/plugin/nextjs']).toBe(false)
      expect(edge?.resolve?.alias?.['@conciv/unplugin/nextjs']).toBe(false)
      const node = cfg.webpack?.({resolve: {alias: {}}}, {nextRuntime: 'nodejs'})
      expect(node?.resolve?.alias?.['@conciv/it/plugin/nextjs']).toBeUndefined()
      expect(node?.resolve?.alias?.['@conciv/unplugin/nextjs']).toBeUndefined()
    })

    it('register refuses options whose plugin entries are not a name or a [name, options] pair', async () => {
      process.env.NEXT_RUNTIME = 'nodejs'
      process.env.CONCIV_OPTIONS = JSON.stringify({plugins: [['@conciv/plugin-page', 'client.mjs']]})
      await expect(register()).rejects.toThrow(
        /CONCIV_OPTIONS is not a valid conciv config[\s\S]*plugin \\"@conciv\/plugin-page\\": the entry must be \[name, options\]/,
      )
      process.env.CONCIV_OPTIONS = '{not json'
      await expect(register()).rejects.toThrow('conciv: CONCIV_OPTIONS is not JSON')
    })

    it('carries a turbopack config beside its webpack hook, keeping the user one, so next build picks Turbopack', () => {
      expect(withConciv({}).turbopack).toEqual({})
      const userTurbopack = {resolveAlias: {'user-lib': './user-lib'}, rules: {}}
      expect(withConciv({turbopack: userTurbopack}).turbopack).toEqual(userTurbopack)
    })

    it('is a passthrough when disabled: no turbopack or webpack config', () => {
      const cfg = withConciv({reactStrictMode: true}, {enabled: false})
      expect(cfg.reactStrictMode).toBe(true)
      expect(cfg.turbopack).toBeUndefined()
      expect(cfg.webpack).toBeUndefined()
    })
  })
})

describe('nextjs edge', () => {
  const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))

  const PROBE = `
import {registerHooks} from 'node:module'
const resolved = []
registerHooks({resolve: (specifier, context, next) => {
  resolved.push(specifier)
  return next(specifier, context)
}})
const entry = await import('@conciv/unplugin/nextjs')
await entry.register()
console.log(JSON.stringify({resolved, exports: Object.keys(entry)}))
`

  function probeEdgeEntry(): {resolved: string[]; exports: string[]} {
    const output = execFileSync(process.execPath, ['--conditions=edge-light', '--input-type=module', '-e', PROBE], {
      cwd: PACKAGE_ROOT,
      env: {...process.env, NEXT_RUNTIME: 'edge'},
      encoding: 'utf8',
    })
    return JSON.parse(output)
  }

  describe('next.js instrumentation entry under the edge runtime', () => {
    it('resolves to a register with no node builtins and no extension package in its module graph', () => {
      const probe = probeEdgeEntry()
      expect(probe.exports).toContain('register')
      expect(probe.resolved.filter((specifier) => specifier.startsWith('node:'))).toEqual([])
      expect(probe.resolved.filter((specifier) => specifier.includes('@conciv/extension'))).toEqual([])
    })
  })
})

describe('nextjs', () => {
  const ENV_KEYS = ['NEXT_PUBLIC_CONCIV_PORT', 'CONCIV_OPTIONS'] as const
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k]
      delete process.env[k]
    }
  })
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  describe('withConciv', () => {
    it('inlines the default port and keeps client + server in agreement', () => {
      const userConfig = {reactStrictMode: true}
      const cfg = withConciv(userConfig)
      expect(cfg.reactStrictMode).toBe(true)
      expect(cfg.env?.NEXT_PUBLIC_CONCIV_PORT).toBe(String(CONCIV_DEFAULT_PORT))
      expect(JSON.parse(cfg.env?.CONCIV_OPTIONS ?? '{}').port).toBe(CONCIV_DEFAULT_PORT)
    })

    it('honours an explicit port exactly', () => {
      const cfg = withConciv({}, {port: 5000})
      expect(cfg.env?.NEXT_PUBLIC_CONCIV_PORT).toBe('5000')
      expect(JSON.parse(cfg.env?.CONCIV_OPTIONS ?? '{}').port).toBe(5000)
    })
  })

  describe('withConciv process.env (Turbopack does not apply the next.config env key)', () => {
    it('sets process.env so Turbopack inlines NEXT_PUBLIC_ and register reads CONCIV_OPTIONS at runtime', () => {
      withConciv({}, {port: 6123})
      expect(process.env.NEXT_PUBLIC_CONCIV_PORT).toBe('6123')
      expect(JSON.parse(process.env.CONCIV_OPTIONS ?? '{}').port).toBe(6123)
    })

    it('does not overwrite an explicit environment override', () => {
      process.env.NEXT_PUBLIC_CONCIV_PORT = '9999'
      process.env.CONCIV_OPTIONS = JSON.stringify({port: 9999})
      withConciv({}, {port: 6123})
      expect(process.env.NEXT_PUBLIC_CONCIV_PORT).toBe('9999')
      expect(JSON.parse(process.env.CONCIV_OPTIONS ?? '{}').port).toBe(9999)
    })

    it('exports no widget port when the widget is off, inherited ones included, and still hands the engine its options', () => {
      process.env.NEXT_PUBLIC_CONCIV_PORT = '6125'
      const cfg = withConciv({env: {NEXT_PUBLIC_CONCIV_PORT: '6124'}}, {port: 6124, widget: false})
      expect(cfg.env).not.toHaveProperty('NEXT_PUBLIC_CONCIV_PORT')
      expect(process.env.NEXT_PUBLIC_CONCIV_PORT).toBeUndefined()
      expect(JSON.parse(cfg.env.CONCIV_OPTIONS ?? '{}')).toMatchObject({port: 6124, widget: false})
      expect(JSON.parse(process.env.CONCIV_OPTIONS ?? '{}')).toMatchObject({port: 6124, widget: false})
    })

    it('never assigns to a literal process.env.NEXT_PUBLIC_ member (bundlers inline it, breaking webpack)', () => {
      const source = readFileSync(fileURLToPath(new URL('../src/core/nextjs.ts', import.meta.url)), 'utf8')
      expect(source).not.toMatch(/process\.env\.NEXT_PUBLIC_\w+\s*(\?\?=|=[^=])/)
    })
  })
})

describe('widget inject', () => {
  const ENTRY = `<script type="module" src="${WIDGET_ROUTE}"></script>`
  const API_BASE = 'http://127.0.0.1:12345'

  function startServer(mw: Middleware, final: (res: ServerResponse) => void): Promise<{server: Server; base: string}> {
    const server = createHttpServer((req, res) => {
      mw(req, res, () => final(res))
    })
    return new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address()
        const port = typeof addr === 'object' && addr ? addr.port : 0
        resolve({server, base: `http://127.0.0.1:${port}`})
      })
    })
  }

  describe('widget inject middleware (IT, real http)', () => {
    const state = {server: undefined as Server | undefined}
    afterEach(async () => {
      await new Promise<void>((r) => (state.server ? state.server.close(() => r()) : r()))
      state.server = undefined
    })

    it('injects the client entry into a streamed text/html response, before </head>', async () => {
      const {server, base} = await startServer(makeWidgetInject(API_BASE), (res) => {
        res.setHeader('content-type', 'text/html')

        res.write('<!doctype html><html><head><title>app</title></head>')
        res.write('<body><h1>hi</h1></body>')
        res.end('</html>')
      })
      state.server = server
      const html = await (await fetch(base)).text()
      expect(html).toContain(ENTRY)
      expect(html).toContain(`<meta name="conciv-api-base" content="${API_BASE}">`)
      expect(html.indexOf(WIDGET_ROUTE)).toBeLessThan(html.indexOf('</head>'))
      expect(html).toContain('<h1>hi</h1>')
    })

    it('injects when headers arrive via writeHead(status, statusText, flat-array) + end(cb) (flat-array writeHead shape)', async () => {
      const {server, base} = await startServer(makeWidgetInject(API_BASE), (res) => {
        res.writeHead(200, 'OK', ['content-type', 'text/html; charset=utf-8'])
        res.write('<!doctype html><html><head><title>app</title></head><body>hi</body></html>')
        res.end(() => {})
      })
      state.server = server
      const res = await fetch(base)
      const html = await res.text()
      expect(res.status).toBe(200)
      expect(html).toContain(ENTRY)
      expect(html.indexOf(WIDGET_ROUTE)).toBeLessThan(html.indexOf('</head>'))
    })

    it('injects the conciv-widget config meta into the SSR html response (the path the site uses)', async () => {
      const widgetConfig = {quickTerminal: {hotkey: ['Alt+k']}}
      const {server, base} = await startServer(makeWidgetInject(API_BASE, widgetConfig), (res) => {
        res.setHeader('content-type', 'text/html')
        res.end('<!doctype html><html><head><title>app</title></head><body>hi</body></html>')
      })
      state.server = server
      const html = await (await fetch(base)).text()
      expect(html).toContain('name="conciv-widget"')
      expect(html).toContain('Alt+k')
      expect(html.indexOf('conciv-widget')).toBeLessThan(html.indexOf('</head>'))
    })

    it('passes non-html responses through untouched', async () => {
      const {server, base} = await startServer(makeWidgetInject(API_BASE), (res) => {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ok: true}))
      })
      state.server = server
      const body = await (await fetch(base)).text()
      expect(body).toBe('{"ok":true}')
      expect(body).not.toContain(WIDGET_ROUTE)
    })

    it('does not double-inject when the html already references the client entry', async () => {
      const preinjected = `<html><head>${ENTRY}</head><body>x</body></html>`
      const {server, base} = await startServer(makeWidgetInject(API_BASE), (res) => {
        res.setHeader('content-type', 'text/html')
        res.end(preinjected)
      })
      state.server = server
      const html = await (await fetch(base)).text()
      const occurrences = html.split(`src="${WIDGET_ROUTE}"`).length - 1
      expect(occurrences).toBe(1)
    })

    it.each([
      {quoting: 'single quotes', settings: '<meta name=\'conciv-widget\' content=\'{"surface":"dock"}\'>'},
      {quoting: 'spaced attributes', settings: '<meta content="{}" name = "conciv-widget" >'},
      {quoting: 'no quotes', settings: '<meta name=conciv-widget content={}>'},
    ])('keeps an injected fragment with no head or body as is ($quoting)', async ({settings}) => {
      const fragment = `${settings}<meta name = 'conciv-api-base' content='${API_BASE}'><div>x</div>`
      const entry = `<script type=module src='${WIDGET_ROUTE}'></script>`
      const {server, base} = await startServer(makeWidgetInject(API_BASE), (res) => {
        res.setHeader('content-type', 'text/html')
        res.end(`${fragment}${entry}`)
      })
      state.server = server
      expect(await (await fetch(base)).text()).toBe(`${fragment}${entry}`)
    })

    it('injects a tag whose name only starts like a conciv tag', async () => {
      const {server, base} = await startServer(makeWidgetInject(API_BASE), (res) => {
        res.setHeader('content-type', 'text/html')
        res.end('<meta name="conciv-widget-preview" content="x"><div>x</div>')
      })
      state.server = server
      expect(await (await fetch(base)).text()).toContain('<meta name="conciv-widget" content="{}">')
    })

    it('adds the missing settings meta when the html already references the client entry', async () => {
      const preinjected = `<html><head>${ENTRY}</head><body>x</body></html>`
      const {server, base} = await startServer(makeWidgetInject(API_BASE, {surface: 'dock'}), (res) => {
        res.setHeader('content-type', 'text/html')
        res.end(preinjected)
      })
      state.server = server
      const html = await (await fetch(base)).text()
      expect(html.split(`src="${WIDGET_ROUTE}"`).length - 1).toBe(1)
      expect(html).toContain('<meta name="conciv-widget" content="{&quot;surface&quot;:&quot;dock&quot;}">')
    })

    it('keeps a settings meta the html already carries', async () => {
      const existing = '<meta name="conciv-widget" content="{}">'
      const preinjected = `<html><head>${existing}${ENTRY}</head><body>x</body></html>`
      const {server, base} = await startServer(makeWidgetInject(API_BASE, {surface: 'dock'}), (res) => {
        res.setHeader('content-type', 'text/html')
        res.end(preinjected)
      })
      state.server = server
      const html = await (await fetch(base)).text()
      expect(html.split('name="conciv-widget"').length - 1).toBe(1)
      expect(html).toContain(existing)
    })
  })
})

describe('vite devtools dock', () => {
  let browser: Browser

  beforeAll(async () => {
    browser = await chromium.launch({headless: true})
  })
  afterAll(() => browser.close())

  function linkConcivIt(root: string): void {
    const embedDir = dirname(dirname(realpathSync(fileURLToPath(import.meta.resolve('@conciv/embed')))))
    mkdirSync(join(root, 'node_modules', '@conciv'), {recursive: true})
    symlinkSync(join(dirname(embedDir), 'it'), join(root, 'node_modules', '@conciv', 'it'))
  }

  async function startHostServer(
    root: string,
    hostHead: string,
    plugins: PluginOption[],
  ): Promise<StartedDevServer & {url: string}> {
    if (!existsSync(join(root, 'node_modules', '@conciv', 'it'))) linkConcivIt(root)
    writeFileSync(
      join(root, 'index.html'),
      `<!doctype html><html><head><meta charset="utf-8">${hostHead}<title>host</title></head><body><h1>host</h1></body></html>`,
    )
    const server = closeWhenTestFinishes(
      await createServer({
        root,
        configFile: false,
        customLogger: createLogger('silent'),
        server: {host: '127.0.0.1', port: 0, watch: null},
        plugins,
      }),
    )
    await server.listen()
    const address = server.httpServer?.address()
    const url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/`
    return {server, root, url}
  }

  function concivHook(root: string, plugins: PluginEntries, widget?: false) {
    return makeViteHook(
      {enabled: true, stateRoot: root, plugins, ...(widget === false ? {widget} : {})},
      {
        embedEntry: fileURLToPath(import.meta.resolve('@conciv/embed')),
      },
    )
  }

  async function startDockServer(
    widget?: false,
    plugins: PluginEntries = [],
    root = testTempDir('conciv-dock-'),
    hostHead = '',
    clientAuth = false,
    hostPlugins: Plugin[] = [],
  ): Promise<StartedDevServer & {url: string}> {
    return startHostServer(root, hostHead, [concivHook(root, plugins, widget), DevTools({clientAuth}), ...hostPlugins])
  }

  async function dockServer(...options: Parameters<typeof startDockServer>): Promise<string> {
    return (await startDockServer(...options)).url
  }

  async function openServedPage(page: Page, url: string): Promise<void> {
    await page.goto(url, {waitUntil: 'commit'})
    await page.waitForLoadState('domcontentloaded', {timeout: 0})
  }

  it('fills the dock panel with the widget and keeps it there when the dock entry is reopened', async () => {
    const page = await browser.newPage({viewport: {width: 1280, height: 800}})
    await page.goto(await dockServer(), {waitUntil: 'domcontentloaded'})
    const entry = page.getByRole('button', {name: 'conciv'})
    await entry.dispatchEvent('click')
    const chat = page.getByRole('dialog', {name: 'conciv chat agent'})
    await chat.getByRole('textbox').first().waitFor()
    expect(await page.getByRole('button', {name: /Open conciv chat|Close chat/}).count()).toBe(0)
    await page.keyboard.press('Escape')
    await chat.getByRole('textbox').first().waitFor({state: 'hidden'})
    await entry.dispatchEvent('click')
    await chat.getByRole('textbox').first().waitFor()
    await page.close()
  }, 60_000)

  it('trusts the dock through Vite DevTools and records it in the trust file', async () => {
    const root = testTempDir('conciv-dock-')
    const page = await browser.newPage({viewport: {width: 1280, height: 800}})
    await page.goto(await dockServer(undefined, [], root), {waitUntil: 'domcontentloaded'})
    await page.getByRole('button', {name: 'conciv'}).dispatchEvent('click')
    await page.getByRole('textbox', {name: 'Message the conciv agent'}).waitFor({timeout: 30_000})
    expect(await page.getByRole('button', {name: 'Authorize conciv'}).count()).toBe(0)
    expect(readTrustedBrowsers(concivStateDir(root))).toEqual([expect.objectContaining({browser: 'via Vite DevTools'})])
    await page.close()
  }, 60_000)

  it('refuses conciv:engine-token to a raw WebSocket that never logged in to Vite DevTools', async () => {
    const root = testTempDir('conciv-dock-')
    const base = await dockServer(undefined, [], root, '', true)
    await fetch(base)
    const socket = new WebSocket(`${base.replace('http', 'ws')}__devtools/__ws`)
    const reply = new Promise<string>((resolve, reject) => {
      socket.addEventListener('message', (event) => {
        if (String(event.data).includes('engine-token-probe')) resolve(String(event.data))
      })
      socket.addEventListener('error', () => reject(new Error('the DevTools socket failed')))
    })
    socket.addEventListener('open', () =>
      socket.send(JSON.stringify({t: 'q', i: 'engine-token-probe', m: 'conciv:engine-token', a: []})),
    )
    const answer = await reply
    socket.close()
    expect(answer).toContain('engine-token-probe')
    expect(answer).toContain('the caller is not authorized')
    expect(readTrustedBrowsers(concivStateDir(root))).toEqual([])
  }, 60_000)

  it('keeps the hidden conciv pane unfocusable while another dock entry is open', async () => {
    const page = await browser.newPage({viewport: {width: 1280, height: 800}})
    await page.goto(await dockServer(), {waitUntil: 'domcontentloaded'})
    const entry = page.getByRole('button', {name: 'conciv'})
    await entry.dispatchEvent('click')
    const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await composer.waitFor()
    await page.getByRole('button', {name: 'Settings'}).click()
    await page.getByRole('combobox', {name: 'Language'}).waitFor()
    await composer.focus()
    await expectLocator(composer).not.toBeFocused()
    await entry.dispatchEvent('click')
    await composer.focus()
    await expectLocator(composer).toBeFocused()
    await page.close()
  }, 60_000)

  it('follows the color mode chosen in the DevTools settings', async () => {
    const page = await browser.newPage({viewport: {width: 1280, height: 800}})
    await page.goto(await dockServer(), {waitUntil: 'domcontentloaded'})
    const concivHost = page.locator('[data-conciv-root]')
    const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
    const chooseColorMode = async (mode: 'Light' | 'Dark'): Promise<void> => {
      await page.getByRole('button', {name: 'Settings'}).dispatchEvent('click')
      await page.getByRole('button', {name: mode, exact: true}).click()
      await page.getByRole('button', {name: 'conciv'}).dispatchEvent('click')
      await composer.waitFor()
    }
    await chooseColorMode('Dark')
    await expectLocator(concivHost).toHaveClass(/(^|\s)dark(\s|$)/)
    await chooseColorMode('Light')
    await expectLocator(concivHost).toHaveClass(/(^|\s)light(\s|$)/)
    await chooseColorMode('Dark')
    await expectLocator(concivHost).toHaveClass(/(^|\s)dark(\s|$)/)
    await page.close()
  }, 60_000)

  it('fills the dock panel with the chat and the tab of a plugin', async () => {
    const page = await browser.newPage({viewport: {width: 1280, height: 800}})
    await page.goto(await dockServer(undefined, fixturePluginEntries()), {waitUntil: 'domcontentloaded'})
    await page.getByRole('button', {name: 'conciv'}).dispatchEvent('click')
    const chat = page.getByRole('dialog', {name: 'conciv chat agent'})
    await chat.getByRole('textbox', {name: 'Message the conciv agent'}).waitFor({timeout: 45_000})
    await expectLocator(chat.getByRole('tab', {name: 'Fixture'})).toBeVisible()
    await page.close()
  }, 90_000)

  it('returns to the chat when the quick terminal opened by hotkey from a freshly opened dock chat closes', async () => {
    const page = await browser.newPage({viewport: {width: 1280, height: 800}})
    await page.goto(await dockServer(undefined, fixturePluginEntries()), {waitUntil: 'domcontentloaded'})
    await page.getByRole('button', {name: 'conciv'}).dispatchEvent('click')
    const panelComposer = page
      .getByRole('dialog', {name: 'conciv chat agent'})
      .getByRole('textbox', {name: 'Message the conciv agent'})
    await panelComposer.waitFor({timeout: 45_000})
    await page.keyboard.press('ControlOrMeta+`')
    await page.getByRole('button', {name: 'Close quick terminal'}).click()
    await expectLocator(panelComposer).toBeVisible({timeout: 3_000})
    await page.close()
  }, 90_000)

  describe('while the conciv dock entry is not showing', () => {
    async function expectUsableQuickTerminal(page: Page): Promise<void> {
      const input = page.getByRole('dialog', {name: 'conciv quick terminal'}).getByRole('textbox').first()
      await input.click({timeout: 10_000})
      await expectLocator(input).toBeFocused()
    }

    async function openDockThenHide(page: Page, hide: (page: Page) => Promise<void>): Promise<void> {
      await page.goto(await dockServer(undefined, fixturePluginEntries()), {waitUntil: 'domcontentloaded'})
      await page.getByRole('button', {name: 'conciv'}).dispatchEvent('click')
      const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
      await composer.waitFor({timeout: 45_000})
      await hide(page)
    }

    const closeDock = async (target: Page): Promise<void> => {
      await target.keyboard.press('Escape')
      await target.getByRole('textbox', {name: 'Message the conciv agent'}).waitFor({state: 'hidden'})
    }

    const selectSettings = async (target: Page): Promise<void> => {
      await target.getByRole('button', {name: 'Settings'}).click()
      await target.getByRole('combobox', {name: 'Language'}).waitFor()
    }

    async function sendPanelCommand(page: Page, command: 'open' | 'toggle'): Promise<void> {
      await page.evaluate((name) => {
        window.dispatchEvent(
          new CustomEvent('conciv-dispatch-event', {detail: {type: `panel:${name}`, payload: null, pluginId: 'panel'}}),
        )
      }, command)
    }

    async function expectUsableChat(page: Page): Promise<void> {
      const composer = page
        .getByRole('dialog', {name: 'conciv chat agent'})
        .getByRole('textbox', {name: 'Message the conciv agent'})
      await composer.click({timeout: 10_000})
      await expectLocator(composer).toBeFocused()
    }

    for (const [label, hide] of [
      ['the dock was closed', closeDock],
      ['another dock entry is selected', selectSettings],
    ] as const) {
      for (const command of ['open', 'toggle'] as const) {
        it(`shows the chat on a panel ${command} command after ${label}`, async () => {
          const page = await browser.newPage({viewport: {width: 1280, height: 800}})
          await openDockThenHide(page, hide)
          await sendPanelCommand(page, command)
          await expectUsableChat(page)
          await page.close()
        }, 90_000)
      }
    }

    it('shows the quick terminal after the dock was closed', async () => {
      const page = await browser.newPage({viewport: {width: 1280, height: 800}})
      await openDockThenHide(page, async (target) => {
        await target.keyboard.press('Escape')
        await target.getByRole('textbox', {name: 'Message the conciv agent'}).waitFor({state: 'hidden'})
      })
      await page.keyboard.press('ControlOrMeta+`')
      await expectUsableQuickTerminal(page)
      await page.close()
    }, 90_000)

    it('shows the quick terminal while another dock entry is selected', async () => {
      const page = await browser.newPage({viewport: {width: 1280, height: 800}})
      await openDockThenHide(page, async (target) => {
        await target.getByRole('button', {name: 'Settings'}).click()
        await target.getByRole('combobox', {name: 'Language'}).waitFor()
      })
      await page.keyboard.press('ControlOrMeta+`')
      await expectUsableQuickTerminal(page)
      await page.close()
    }, 90_000)
  })

  it('shows the chat in the dock when a closed floating widget left its panel route behind', async () => {
    const root = testTempDir('conciv-dock-')
    writeFileSync(join(root, 'index.html'), '<!doctype html><meta charset="utf-8"><title>host</title>')
    const floating = await startTestDevServer(
      {},
      {
        embedEntry: fileURLToPath(import.meta.resolve('@conciv/embed')),
      },
      root,
    )
    const floatingUrl = floating.server.resolvedUrls?.local[0]
    if (floatingUrl === undefined) throw new Error('dev server did not start')
    const floatingPage = await browser.newPage({viewport: {width: 1280, height: 800}})
    await rpcSocketFor(floatingPage).installed
    await openServedPage(floatingPage, await magicLinkUrl(floating, floatingUrl))
    await floatingPage.getByRole('button', {name: /conciv chat$/}).click({timeout: 45_000})
    const floatingComposer = floatingPage.getByRole('textbox', {name: 'Message the conciv agent'})
    await floatingComposer.waitFor()
    const observer = rpcObserverFor(floatingPage)
    const beforeEscape = observer.mark()
    await floatingComposer.press('Escape')
    await observer.completed({
      path: NAVIGATION_SET_PATH,
      input: /^(?!.*open=true).*\/panel\/(?!latest)/,
      since: beforeEscape,
    })
    await floatingPage.close()
    await floating.server.close()
    const page = await browser.newPage({viewport: {width: 1280, height: 800}})
    await openServedPage(page, await dockServer(undefined, [], root))
    await page.getByRole('button', {name: 'conciv'}).dispatchEvent('click')
    await expectLocator(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible({timeout: 30_000})
    await page.close()
  }, 120_000)

  it('shows the page launcher when the host renders its html without transformIndexHtml', async () => {
    const serverRenderedHost: Plugin = {
      name: 'server-rendered-host',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url !== '/') return next()
          res.setHeader('content-type', 'text/html')
          res.end(
            '<!doctype html><html><head><meta charset="utf-8"><title>ssr</title></head><body><h1>ssr</h1></body></html>',
          )
        })
      },
    }
    const started = await startDockServer(undefined, [], undefined, '', false, [serverRenderedHost])
    const page = await browser.newPage({viewport: {width: 1280, height: 800}})
    await page.goto(await magicLinkUrl(started, started.url), {waitUntil: 'domcontentloaded'})
    await expectLocator(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: 30_000})
    await page.close()
  }, 60_000)

  it.each([
    {host: 'no conciv-widget meta', hostMeta: ''},
    {host: 'its own conciv-widget meta', hostMeta: '<meta name="conciv-widget" content="{}">'},
  ])(
    'mounts one widget, in the dock, when a framework client-entry module also loads on a page with $host',
    async ({hostMeta}) => {
      const root = testTempDir('conciv-dock-')
      mkdirSync(join(root, 'src'))
      writeFileSync(
        join(root, 'src', 'client-entry.ts'),
        "await import('/@conciv/widget.js')\ndocument.title = 'page module evaluated'\nexport {}\n",
      )
      const page = await browser.newPage({viewport: {width: 1280, height: 800}})
      const url = await dockServer(
        undefined,
        [],
        root,
        `${hostMeta}<script type="module" src="/src/client-entry.ts"></script>`,
      )
      await page.goto(url, {waitUntil: 'domcontentloaded'})
      await expectLocator(page).toHaveTitle('page module evaluated', {timeout: 30_000})
      await page.getByRole('button', {name: 'conciv'}).dispatchEvent('click')
      const composers = page.getByRole('textbox', {name: 'Message the conciv agent'})
      await composers.first().waitFor({timeout: 30_000})
      await expectLocator(composers).toHaveCount(1)
      await expectLocator(page.getByRole('button', {name: /Open conciv chat|Close chat/})).toHaveCount(0)
      await page.close()
    },
    60_000,
  )

  it('mounts the floating page widget when the host conciv-widget meta holds null', async () => {
    const root = testTempDir('conciv-null-meta-')
    const started = await startHostServer(root, '<meta name="conciv-widget" content="null">', [concivHook(root, [])])
    const page = await browser.newPage({viewport: {width: 1280, height: 800}})
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.goto(await magicLinkUrl(started, started.url), {waitUntil: 'domcontentloaded'})
    await expectLocator(page.getByRole('button', {name: /conciv chat$/})).toBeVisible({timeout: 30_000})
    expect(pageErrors).toEqual([])
    await page.close()
  }, 60_000)

  it('runs as the dock when the host html already carries a conciv-widget meta', async () => {
    const page = await browser.newPage({viewport: {width: 1280, height: 800}})
    const url = await dockServer(undefined, [], undefined, '<meta name="conciv-widget" content="{}">')
    await page.goto(url, {waitUntil: 'domcontentloaded'})
    await page.getByRole('button', {name: 'conciv'}).dispatchEvent('click')
    await expectLocator(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible({timeout: 30_000})
    expect(await page.getByRole('button', {name: /Open conciv chat|Close chat/}).count()).toBe(0)
    await page.close()
  }, 60_000)

  it('shows the inline chat after a pop-out started from the quick terminal of a closed widget closes', async () => {
    const quickServer = await startTestDevServer(
      {plugins: fixturePluginEntries()},
      {
        embedEntry: fileURLToPath(import.meta.resolve('@conciv/embed')),
      },
      testTempDir('conciv-quick-'),
    )
    const {server} = quickServer
    writeFileSync(join(server.config.root, 'index.html'), '<!doctype html><meta charset="utf-8"><title>host</title>')
    const url = server.resolvedUrls?.local[0]
    if (url === undefined) throw new Error('dev server did not start')
    const page = await browser.newPage({viewport: {width: 1280, height: 800}})
    await page.goto(await magicLinkUrl(quickServer, url), {waitUntil: 'domcontentloaded'})
    await page.getByRole('button', {name: /conciv chat$/}).waitFor({timeout: 45_000})
    const quick = page.getByRole('dialog', {name: 'conciv quick terminal'})
    await expectLocator(async () => {
      await page.keyboard.press('ControlOrMeta+`')
      await expectLocator(quick).toBeVisible({timeout: 1_000})
    }).toPass({timeout: 30_000})
    const popup = page.waitForEvent('popup')
    await quick.getByRole('button', {name: 'Pop out'}).click()
    await (await popup).close()
    await expectLocator(
      page.getByRole('dialog', {name: 'conciv chat agent'}).getByRole('textbox', {name: 'Message the conciv agent'}),
    ).toBeVisible()
    await page.close()
  }, 90_000)

  type ColdInstall = {builtins: Builtins; plugins: PluginEntries}

  function installConcivInto(root: string, storeSegments: string[]): ColdInstall {
    const store = join(root, ...storeSegments)
    const installed = join(installConcivPackage(root, '@conciv/embed', store), '..')
    installFixturePlugin(root)
    const workspaceIt = join(
      dirname(dirname(dirname(realpathSync(fileURLToPath(import.meta.resolve('@conciv/embed')))))),
      'it',
    )
    cpSync(join(workspaceIt, 'package.json'), join(installed, 'it', 'package.json'))
    if (!existsSync(join(root, 'node_modules', '@conciv', 'it'))) {
      mkdirSync(join(root, 'node_modules', '@conciv'), {recursive: true})
      symlinkSync(join(installed, 'it'), join(root, 'node_modules', '@conciv', 'it'))
    }
    return {
      builtins: {
        embedEntry: join(installed, 'embed', 'dist', 'mount.js'),
      },
      plugins: [],
    }
  }

  function linkWorkspaceConciv(root: string): ColdInstall {
    linkConcivIt(root)
    return {
      builtins: {
        embedEntry: fileURLToPath(import.meta.resolve('@conciv/embed')),
      },
      plugins: fixturePluginEntries(),
    }
  }

  it.each([
    {layout: 'flat', prepare: (root: string) => installConcivInto(root, ['node_modules'])},
    {
      layout: 'pnpm-isolated',
      prepare: (root: string) => installConcivInto(root, ['node_modules', '.pnpm', 'node_modules']),
    },
    {layout: 'workspace-linked', prepare: linkWorkspaceConciv},
  ])(
    'opens the chat and a plugin tab on a cold cache of a $layout conciv install with one Solid and without Vite re-optimizing dependencies',
    async ({prepare}) => {
      const root = testTempDir('conciv-cold-')
      writeFileSync(join(root, 'index.html'), '<!doctype html><meta charset="utf-8"><title>host</title>')
      const {builtins, plugins} = prepare(root)
      const logged: string[] = []
      const remember = (message: string): void => void logged.push(message)
      const server = closeWhenTestFinishes(
        await createServer({
          root,
          configFile: false,
          customLogger: {
            ...createLogger('silent'),
            info: remember,
            warn: remember,
            warnOnce: remember,
          },
          server: {host: '127.0.0.1', port: 0},
          plugins: [makeViteHook({enabled: true, stateRoot: root, plugins}, builtins)],
        }),
      )
      await server.listen()
      const url = server.resolvedUrls?.local[0]
      if (url === undefined) throw new Error('dev server did not start')
      const page = await browser.newPage({viewport: {width: 1280, height: 800}})
      const gatewayFailures: string[] = []
      page.on('response', (response) => {
        if (response.status() === 504) gatewayFailures.push(response.url())
      })
      const warnings: string[] = []
      page.on('console', (message) => {
        if (message.type() === 'warning') warnings.push(message.text())
      })
      await page.goto(await magicLinkUrl({server, root}, url), {waitUntil: 'domcontentloaded'})
      await page.getByRole('button', {name: /conciv chat$/}).click({timeout: 45_000})
      const chat = page.getByRole('dialog', {name: 'conciv chat agent'})
      await chat.getByRole('textbox', {name: 'Message the conciv agent'}).waitFor({timeout: 15_000})
      await chat.getByRole('tab', {name: 'Fixture'}).click()
      await expectLocator(chat.getByText('The fixture plugin view')).toBeVisible()
      expect(
        logged.filter((line) =>
          /Failed to resolve dependency|optimized dependencies changed|new dependencies optimized/.test(line),
        ),
      ).toEqual([])
      const metadata: unknown = JSON.parse(readFileSync(join(server.config.cacheDir, 'deps', '_metadata.json'), 'utf8'))
      expect(metadata).toMatchObject({
        optimized: {'@conciv/it > @conciv/embed > @conciv/solid-diffs > @tanstack/solid-pacer': expect.anything()},
      })
      expect(gatewayFailures).toEqual([])
      expect(warnings.filter((warning) => warning.includes('multiple instances of Solid'))).toEqual([])
      await page.close()
    },
    120_000,
  )

  it('keeps the floating page widget when Vite DevTools is not enabled', async () => {
    const {server} = await startTestDevServer()
    const address = server.httpServer?.address()
    const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
    const source = await (await fetch(`${base}${WIDGET_ROUTE}`)).text()
    expect(source).toContain('mountConciv')
    expect(source).not.toContain('concivDockRenderer')
  })

  it('registers no dock entry when the widget is off', async () => {
    const page = await browser.newPage()
    await page.goto(await dockServer(false), {waitUntil: 'domcontentloaded'})
    await page.getByRole('button', {name: 'Settings'}).waitFor()
    expect(await page.getByRole('button', {name: 'conciv'}).count()).toBe(0)
    await page.close()
  }, 60_000)

  describe('pop-out window', () => {
    const composerName = 'Message the conciv agent'

    async function dockPage(): Promise<Page> {
      const page = await browser.newPage({viewport: {width: 1280, height: 800}})
      await rpcSocketFor(page).installed
      return page
    }

    async function openDockChat(page: Page): Promise<void> {
      await page.getByRole('button', {name: 'conciv'}).dispatchEvent('click')
      await page.getByRole('dialog', {name: 'conciv chat agent'}).getByRole('textbox', {name: composerName}).waitFor()
    }

    async function popOut(page: Page): Promise<Page> {
      await page.getByRole('button', {name: 'Session options'}).click()
      const popup = page.waitForEvent('popup')
      const observer = rpcObserverFor(page)
      const beforePopOut = observer.mark()
      await page.getByRole('button', {name: 'Pop out to a window'}).click()
      const popupPage = await popup
      await observer.completed({path: NAVIGATION_SET_PATH, input: /\/pip\//, since: beforePopOut})
      await expectLocator(popupPage.getByRole('textbox', {name: composerName})).toBeVisible()
      return popupPage
    }

    async function expectWorkingComposer(page: Page): Promise<void> {
      const composer = page.getByRole('textbox', {name: composerName})
      await composer.click()
      await composer.pressSequentially('hello')
      await expectLocator(page.getByRole('button', {name: 'Send message'})).toBeEnabled()
    }

    async function allowPopupsOnlyDuringAClick(page: Page): Promise<void> {
      await page.addInitScript(() => {
        const open = window.open.bind(window)
        const opened: {popup: Window | null} = {popup: null}
        window.open = (...args: Parameters<typeof window.open>) => {
          if (opened.popup !== null && !opened.popup.closed) return opened.popup
          const inClick = /eventHandler/.test(new Error('click stack').stack ?? '')
          if (!inClick || Reflect.get(window, 'popupsBlocked') === true) return null
          opened.popup = open(...args)
          return opened.popup
        }
      })
    }

    it('opens the pop-out from the session menu while the click still allows popups', async () => {
      const page = await dockPage()
      await allowPopupsOnlyDuringAClick(page)
      await page.goto(await dockServer(), {waitUntil: 'domcontentloaded'})
      await openDockChat(page)
      const popupPage = await popOut(page)
      await expectWorkingComposer(popupPage)
      await page.close()
    }, 60_000)

    it('offers pop out again when the browser blocks the window, and opens it from that action', async () => {
      const page = await browser.newPage({viewport: {width: 1280, height: 800}})
      await allowPopupsOnlyDuringAClick(page)
      await page.goto(await dockServer(), {waitUntil: 'domcontentloaded'})
      await openDockChat(page)
      await page.evaluate(() => Reflect.set(window, 'popupsBlocked', true))
      await page.getByRole('button', {name: 'Session options'}).click()
      await page.getByRole('button', {name: 'Pop out to a window'}).click()
      const popOutAgain = page.getByRole('button', {name: 'Pop out again'})
      await popOutAgain.waitFor()
      await page.evaluate(() => Reflect.set(window, 'popupsBlocked', false))
      const popup = page.waitForEvent('popup')
      await popOutAgain.click()
      await expectWorkingComposer(await popup)
      await page.close()
    }, 60_000)

    it('shows a popped-out state in the dock that brings the chat back', async () => {
      const page = await dockPage()
      await page.goto(await dockServer(), {waitUntil: 'domcontentloaded'})
      await openDockChat(page)
      const popupPage = await popOut(page)
      await expectLocator(page.getByText('Chat is popped out')).toBeVisible()
      const closed = popupPage.waitForEvent('close')
      await page.getByRole('button', {name: 'Bring it back'}).click()
      await closed
      await expectLocator(page.getByRole('textbox', {name: composerName})).toBeVisible()
      await page.close()
    }, 60_000)

    it('re-attaches to the still-open pop-out after the page reloads', async () => {
      const page = await dockPage()
      await page.goto(await dockServer(), {waitUntil: 'domcontentloaded'})
      await openDockChat(page)
      const popupPage = await popOut(page)
      await page.reload({waitUntil: 'domcontentloaded'})
      await expectLocator(page.getByText('Chat is popped out')).toBeVisible({timeout: 20_000})
      await expectWorkingComposer(popupPage)
      await page.close()
    }, 60_000)

    it('returns to the inline chat when the user closes the pop-out after a reload', async () => {
      const page = await dockPage()
      await page.goto(await dockServer(), {waitUntil: 'domcontentloaded'})
      await openDockChat(page)
      const popupPage = await popOut(page)
      await page.reload({waitUntil: 'domcontentloaded'})
      await expectLocator(page.getByText('Chat is popped out')).toBeVisible({timeout: 20_000})
      await popupPage.close()
      await expectLocator(page.getByRole('textbox', {name: composerName})).toBeVisible()
      await expectLocator(page.getByText('Chat is popped out')).toBeHidden()
      await page.close()
    }, 60_000)

    it('falls back to the inline chat with a pop out again action when the pop-out cannot be restored', async () => {
      const url = await dockServer()
      const first = await dockPage()
      await first.goto(url, {waitUntil: 'domcontentloaded'})
      await openDockChat(first)
      const stale = await popOut(first)
      await first.close()
      await stale.close()
      const page = await browser.newPage({viewport: {width: 1280, height: 800}})
      await page.addInitScript(() => {
        const open = window.open.bind(window)
        window.open = (...args: Parameters<typeof window.open>) =>
          Reflect.get(window, 'popupsAllowed') === true ? open(...args) : null
      })
      await page.goto(url, {waitUntil: 'domcontentloaded'})
      await openDockChat(page)
      await page.evaluate(() => Reflect.set(window, 'popupsAllowed', true))
      const popup = page.waitForEvent('popup')
      await page.getByRole('button', {name: 'Pop out again'}).click()
      const popupPage = await popup
      await expectWorkingComposer(popupPage)
      await page.close()
    }, 60_000)
  })
})

describe('optimize deps', () => {
  describe('vite optimizeDeps for the plugin graph', () => {
    it('excludes the Solid singletons and the plugin runtime, force-includes nothing', () => {
      const {optimizeDeps} = concivSolidConfig()
      expect(optimizeDeps.exclude).toEqual([
        'solid-js',
        'solid-js/web',
        'solid-js/store',
        '@tanstack/solid-router',
        '@ark-ui/solid',
        '@conciv/plugin',
      ])
      expect(optimizeDeps.include).toEqual([])
    })
  })
})

describe('vite bridge', () => {
  it('finds a module by a path relative to the project, by its /src url and by its absolute path, and names a file it does not know', async () => {
    const root = await realpath(tempDir('conciv-vite-bridge-'))
    await mkdir(join(root, 'src'))
    await writeFile(join(root, 'index.html'), '<!doctype html><script type="module" src="/src/main.ts"></script>')
    await writeFile(join(root, 'src/main.ts'), "import {dep} from './dep'\nexport const main = dep\n")
    await writeFile(join(root, 'src/dep.ts'), 'export const dep = 1\n')
    const nestedDep = join(root, root, 'src/dep.ts')
    await mkdir(dirname(nestedDep), {recursive: true})
    await writeFile(nestedDep, 'export const dep = 2\n')
    const server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      server: {host: '127.0.0.1', port: 0},
    })
    try {
      await server.listen()
      const address = server.httpServer?.address()
      const port = typeof address === 'object' && address ? address.port : 0
      await fetch(`http://127.0.0.1:${port}/src/main.ts`).then((response) => response.text())
      await fetch(`http://127.0.0.1:${port}/src/dep.ts`).then((response) => response.text())
      await fetch(`http://127.0.0.1:${port}/@fs${nestedDep}`).then((response) => response.text())
      const bridge = makeViteBridge(server)
      const depNode = {url: '/src/dep.ts', importers: ['/src/main.ts'], importedModules: []}

      expect(bridge.moduleGraph('src/dep.ts')).toEqual([depNode])
      expect(bridge.moduleGraph('/src/dep.ts')).toEqual([depNode])
      expect(bridge.moduleGraph(join(root, 'src/dep.ts'))).toEqual([depNode])
      expect(() => bridge.moduleGraph('src/missing.ts')).toThrow(
        "no module for src/missing.ts in the dev server's module graph",
      )
    } finally {
      await server.close()
      await rm(root, {recursive: true, force: true})
    }
  })
})
