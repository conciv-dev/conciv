import {execFileSync} from 'node:child_process'
import {cp, mkdtemp, realpath, writeFile} from 'node:fs/promises'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  cpSync,
  writeFileSync,
} from 'node:fs'
import {createServer as createHttpServer, type Server, type ServerResponse} from 'node:http'
import {createServer as createNetServer} from 'node:net'
import {tmpdir} from 'node:os'
import {dirname, isAbsolute, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it} from 'vitest'
import getPort from 'get-port'
import {chromium, type Browser, type Page} from 'playwright'
import {expect as expectLocator} from 'playwright/test'
import {DevTools} from '@vitejs/devtools'
import {createLogger, createServer, type Plugin, type ViteDevServer} from 'vite'
import type {Engine} from '@conciv/core/start'
import {EXTENSIONS_RESOLVED_ID, NO_BUILTINS, type Builtins} from '@conciv/extension-compiler/extensions'
import ios from '@conciv/extension-ios'
import recorder from '@conciv/extension-recorder'
import terminal from '@conciv/extension-terminal'
import testRunner from '@conciv/extension-test-runner'
import whiteboard from '@conciv/extension-whiteboard'
import type {BundlerDiagnostic} from '@conciv/protocol/bundler-types'
import {installConcivBinShim} from '../src/core/bin-shim.js'
import {makeEngineBooter} from '../src/core/boot.js'
import {generateExtensionsEntrySource, writeExtensionsEntry} from '../src/core/extensions-entry.js'
import {watchExtensionsDir} from '../src/core/extensions-watch.js'
import {CONCIV_DEFAULT_PORT, withConciv} from '../src/core/nextjs.js'
import {makeViteBridge, makeViteHook} from '../src/core/vite.js'
import {EXTENSIONS_ROUTE, type Middleware, makeWidgetInject} from '../src/core/widget-middleware.js'
import {devServers, installConcivPackage, pageApiBase, type StartedDevServer} from './helpers/dev-servers.js'

describe('bin shim', () => {
  describe('installConcivBinShim', () => {
    it('symlinks the agent-facing conciv shim to the cli package bin', () => {
      const stateDir = mkdtempSync(join(tmpdir(), 'conciv-bin-shim-'))
      const agentPath = installConcivBinShim(stateDir)
      expect(agentPath.startsWith(join(stateDir, 'bin'))).toBe(true)
      const target = realpathSync(join(stateDir, 'bin', 'conciv'))
      expect(target.endsWith(join('packages', 'cli', 'dist', 'bin.js'))).toBe(true)
      const manifest = readFileSync(join(dirname(dirname(target)), 'package.json'), 'utf8')
      expect(manifest).toContain('"name": "@conciv/cli"')
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
      const root = await realpath(await mkdtemp(join(await realpath(tmpdir()), 'conciv-diag-')))
      await cp(FIXTURE, root, {recursive: true})
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

      const ring: BundlerDiagnostic[] = []
      const bridge = makeViteBridge(server)
      const unsubscribe = bridge.subscribe?.((diagnostic) => ring.push(diagnostic))

      await fetch(`${base}/broken.ts`, {headers: {'sec-fetch-dest': 'script'}}).catch(() => undefined)
      const buildError = await waitFor(() => ring.find((diagnostic) => diagnostic.kind === 'build-error'))
      if (buildError.kind !== 'build-error') throw new Error('expected build-error diagnostic')
      expect(buildError.file).toContain('broken.ts')
      expect(buildError.message.length).toBeGreaterThan(0)
      expect(buildError.timestamp).toBeGreaterThan(0)

      await writeFile(join(root, 'good.ts'), `export const greeting = 'updated'\n`)
      const hmr = await waitFor(() => ring.find((diagnostic) => diagnostic.kind === 'hmr-update'))
      if (hmr.kind !== 'hmr-update') throw new Error('expected hmr-update diagnostic')
      expect(hmr.file).toContain('good.ts')

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

describe('engine port exact', () => {
  function holdPort(port: number): Promise<() => Promise<void>> {
    const blocker = createNetServer()
    return new Promise((resolve, reject) => {
      blocker.once('error', reject)
      blocker.listen(port, '127.0.0.1', () => resolve(() => new Promise<void>((done) => blocker.close(() => done()))))
    })
  }

  function tempRoot(): string {
    return mkdtempSync(join(tmpdir(), 'conciv-engine-port-exact-'))
  }

  describe('makeEngineBooter with the exact port policy (Next.js and the generic webpack/rspack plugin)', () => {
    it('boots on the requested fixed port', async () => {
      const root = tempRoot()
      let engine: Engine | undefined
      try {
        const port = await getPort()
        engine = await makeEngineBooter({port, stateRoot: root}, root, NO_BUILTINS, 'exact')()
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
        await expect(
          makeEngineBooter({port: taken, stateRoot: root}, root, NO_BUILTINS, 'exact')(),
        ).rejects.toMatchObject({code: 'EADDRINUSE'})
      } finally {
        await release()
        rmSync(root, {recursive: true, force: true})
      }
    })
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

describe('extensions entry', () => {
  function makeProject(): string {
    return mkdtempSync(join(tmpdir(), 'conciv-entry-'))
  }

  function seedExtensionsDir(root: string): string {
    const dir = join(root, 'conciv', 'extensions')
    mkdirSync(dir, {recursive: true})
    return dir
  }

  describe('generateExtensionsEntrySource', () => {
    it('emits sorted extensionless imports and provenance sources in filename order', () => {
      const source = generateExtensionsEntrySource(['b.tsx', 'a.ts'])
      expect(source).toContain('// generated by conciv — do not edit')
      expect(source).toContain("import extension0 from '../conciv/extensions/a'")
      expect(source).toContain("import extension1 from '../conciv/extensions/b'")
      expect(source).toContain(
        "export const entries = [{extension: extension0, source: '/conciv/extensions/a.ts'}, {extension: extension1, source: '/conciv/extensions/b.tsx'}]",
      )
    })

    it('byte-matches the spike shape for a single extension (no semicolons, single quotes)', () => {
      const source = generateExtensionsEntrySource(['tanstack.tsx'])
      expect(source).toBe(
        '// generated by conciv — do not edit\n' +
          "import extension0 from '../conciv/extensions/tanstack'\n" +
          "export const entries = [{extension: extension0, source: '/conciv/extensions/tanstack.tsx'}]\n",
      )
    })

    it('binds a hyphenated basename to a valid index identifier with an extensionless specifier', () => {
      const source = generateExtensionsEntrySource(['deploy-button.tsx'])
      expect(source).toContain("import extension0 from '../conciv/extensions/deploy-button'")
      expect(source).toContain("{extension: extension0, source: '/conciv/extensions/deploy-button.tsx'}")
      expect(source).not.toContain(';')
      expect(source).not.toContain('"')
    })

    it('throws naming both files when two inputs share an extensionless basename', () => {
      expect(() => generateExtensionsEntrySource(['foo.ts', 'foo.tsx'])).toThrow(/foo\.ts/)
      expect(() => generateExtensionsEntrySource(['foo.ts', 'foo.tsx'])).toThrow(/foo\.tsx/)
    })

    it('emits an empty entries array for empty input', () => {
      expect(generateExtensionsEntrySource([])).toContain('export const entries = []')
    })
  })

  describe('writeExtensionsEntry', () => {
    it('lists only real extension files (sorted), ignoring d.ts, non-tsx, and subdirectories', () => {
      const root = makeProject()
      const dir = seedExtensionsDir(root)
      writeFileSync(join(dir, 'b.tsx'), 'export default {}')
      writeFileSync(join(dir, 'a.ts'), 'export default {}')
      writeFileSync(join(dir, 'types.d.ts'), 'export {}')
      writeFileSync(join(dir, 'notes.md'), 'hi')
      mkdirSync(join(dir, 'nested.ts'), {recursive: true})

      const result = writeExtensionsEntry(root)
      const content = readFileSync(result.path, 'utf8')
      expect(content).toContain("import extension0 from '../conciv/extensions/a'")
      expect(content).toContain("import extension1 from '../conciv/extensions/b'")
      expect(content).not.toContain('types')
      expect(content).not.toContain('notes')
      expect(content).not.toContain('nested')
      expect(result.path).toBe(join(root, '.conciv', 'extensions-client.gen.tsx'))
    })

    it('writes an empty-entries file for a missing extensions dir', () => {
      const root = makeProject()
      const result = writeExtensionsEntry(root)
      expect(result.changed).toBe(true)
      expect(readFileSync(result.path, 'utf8')).toContain('export const entries = []')
    })

    it('is idempotent: second write leaves the file untouched, third write reacts to a new stub', () => {
      const root = makeProject()
      const dir = seedExtensionsDir(root)
      writeFileSync(join(dir, 'a.ts'), 'export default {}')

      const first = writeExtensionsEntry(root)
      expect(first.changed).toBe(true)
      const firstMtime = statSync(first.path).mtimeMs

      const second = writeExtensionsEntry(root)
      expect(second.changed).toBe(false)
      expect(statSync(second.path).mtimeMs).toBe(firstMtime)

      writeFileSync(join(dir, 'b.tsx'), 'export default {}')
      const third = writeExtensionsEntry(root)
      expect(third.changed).toBe(true)
      expect(readFileSync(third.path, 'utf8')).toContain("import extension1 from '../conciv/extensions/b'")
    })
  })
})

describe('extensions watch', () => {
  const disposers: Array<() => Promise<void>> = []
  const roots: string[] = []

  afterEach(async () => {
    for (const dispose of disposers.splice(0)) await dispose()
    for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true})
  })

  function makeRoot(): string {
    const root = mkdtempSync(join(tmpdir(), 'conciv-watch-'))
    roots.push(root)
    return root
  }

  function track(dispose: () => Promise<void>): () => Promise<void> {
    disposers.push(dispose)
    return dispose
  }

  function extDir(root: string): string {
    return join(root, 'conciv', 'extensions')
  }

  function generatedFile(root: string): string {
    return join(root, '.conciv', 'extensions-client.gen.tsx')
  }

  function readGenerated(root: string): string {
    const path = generatedFile(root)
    return existsSync(path) ? readFileSync(path, 'utf8') : ''
  }

  function stub(root: string, name: string): void {
    mkdirSync(extDir(root), {recursive: true})
    writeFileSync(join(extDir(root), name), 'export default {}')
  }

  const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

  async function waitFor(predicate: () => boolean, timeoutMs = 5000, intervalMs = 25): Promise<void> {
    const start = Date.now()
    while (!predicate()) {
      if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out')
      await sleep(intervalMs)
    }
  }

  const contains = (root: string, name: string): boolean => readGenerated(root).includes(`/conciv/extensions/${name}`)

  async function waitReady(root: string): Promise<void> {
    await waitFor(() => existsSync(generatedFile(root)))
  }

  describe('watchExtensionsDir', () => {
    it('regenerates when a stub is added and again when it is removed', async () => {
      const root = makeRoot()
      mkdirSync(extDir(root), {recursive: true})
      track(watchExtensionsDir(root))
      await waitReady(root)

      stub(root, 'alpha.tsx')
      await waitFor(() => contains(root, 'alpha'))

      rmSync(join(extDir(root), 'alpha.tsx'))
      await waitFor(() => !contains(root, 'alpha'))
    })

    it('stops regenerating after dispose', async () => {
      const root = makeRoot()
      mkdirSync(extDir(root), {recursive: true})
      const dispose = watchExtensionsDir(root)
      await waitReady(root)
      stub(root, 'alpha.tsx')
      await waitFor(() => contains(root, 'alpha'))

      await dispose()
      const before = readGenerated(root)
      stub(root, 'beta.tsx')
      await sleep(600)
      expect(readGenerated(root)).toBe(before)
      expect(contains(root, 'beta')).toBe(false)
    })

    it('regenerates from a root with neither conciv/ nor extensions/ present', async () => {
      const root = makeRoot()
      track(watchExtensionsDir(root))
      await waitReady(root)
      mkdirSync(extDir(root), {recursive: true})
      stub(root, 'alpha.tsx')
      await waitFor(() => contains(root, 'alpha'))
    })

    it('regenerates when conciv/ exists but extensions/ is created later', async () => {
      const root = makeRoot()
      mkdirSync(join(root, 'conciv'), {recursive: true})
      track(watchExtensionsDir(root))
      await waitReady(root)
      stub(root, 'alpha.tsx')
      await waitFor(() => contains(root, 'alpha'))
    })

    it('regenerates through a staged conciv/ then extensions/ then stub creation', async () => {
      const root = makeRoot()
      track(watchExtensionsDir(root))
      await waitReady(root)
      mkdirSync(join(root, 'conciv'), {recursive: true})
      await sleep(200)
      mkdirSync(extDir(root), {recursive: true})
      await sleep(200)
      stub(root, 'alpha.tsx')
      await waitFor(() => contains(root, 'alpha'))
    })

    it('regenerates after a recursive mkdir then stub', async () => {
      const root = makeRoot()
      track(watchExtensionsDir(root))
      await waitReady(root)
      stub(root, 'alpha.tsx')
      await waitFor(() => contains(root, 'alpha'))
    })

    it('resumes after the conciv/ dir is deleted and recreated with a stub', async () => {
      const root = makeRoot()
      stub(root, 'alpha.tsx')
      track(watchExtensionsDir(root))
      await waitFor(() => contains(root, 'alpha'))

      rmSync(join(root, 'conciv'), {recursive: true, force: true})
      await waitFor(() => !contains(root, 'alpha'))
      await sleep(200)

      stub(root, 'beta.tsx')
      await waitFor(() => contains(root, 'beta'))
    })

    it('keeps exactly one live watcher when called twice for the same root', async () => {
      const root = makeRoot()
      mkdirSync(extDir(root), {recursive: true})
      const first = watchExtensionsDir(root)
      const second = watchExtensionsDir(root)
      await waitReady(root)

      stub(root, 'alpha.tsx')
      await waitFor(() => contains(root, 'alpha'))

      await second()
      const before = readGenerated(root)
      stub(root, 'beta.tsx')
      await sleep(600)
      expect(readGenerated(root)).toBe(before)
      expect(contains(root, 'beta')).toBe(false)

      await first()
    })
  })
})

describe('inject source hook', () => {
  const ROOT = '/proj'

  function transformViaHook(peerPlugins: {name: string}[]): {code: string} | null {
    const hook = makeViteHook({enabled: true})
    const configResolved = hook.configResolved
    if (typeof configResolved === 'function')
      configResolved.call({} as never, {root: ROOT, plugins: peerPlugins} as never)
    const transform = hook.transform
    const run = typeof transform === 'function' ? transform : transform?.handler
    if (!run) throw new Error('conciv plugin has no transform')
    const result = run.call(
      {} as never,
      'export const A = () => <div>hi</div>\n',
      `${ROOT}/src/App.tsx`,
      undefined as never,
    )
    return result as {code: string} | null
  }

  const reactPlugin: Plugin = {name: 'vite:react'}
  const tsdInjectSource: Plugin = {name: '@tanstack/devtools:inject-source'}

  describe('makeViteHook source injection', () => {
    it('resolves the injected extensions script URL into the module graph', async () => {
      const hook = makeViteHook({enabled: true})
      const resolveId = hook.resolveId
      const run = typeof resolveId === 'function' ? resolveId : resolveId?.handler
      if (!run) throw new Error('conciv plugin has no resolveId')
      const out = await run.call({} as never, `${EXTENSIONS_ROUTE}?v=1`, undefined as never, {} as never)
      expect(out).toBe(EXTENSIONS_RESOLVED_ID)
    })

    it('stamps data-conciv-source when no @tanstack/devtools source injector is present', () => {
      const out = transformViaHook([reactPlugin])
      expect(out?.code).toContain('data-conciv-source=')
    })

    it('defers to @tanstack/devtools (no data-conciv-source) when its inject-source plugin is present', () => {
      const out = transformViaHook([reactPlugin, tsdInjectSource])
      expect(out).toBeNull()
    })
  })
})

describe('native page vite boot', () => {
  const NATIVE_BUNDLE = 'conciv-widget-native.global.js'
  const BUILTIN_EXTENSIONS = [
    '@conciv/extension-terminal',
    '@conciv/extension-test-runner',
    '@conciv/extension-whiteboard',
    '@conciv/extension-recorder',
    '@conciv/extension-ios',
  ]
  const INTEROP_ERROR = /SyntaxError|does not provide an export named/

  describe('dev core booted through the vite plugin', () => {
    const servers = devServers()

    afterEach(() => servers.stopAll())

    it('serves /native because configureServer threads the native page dir into the engine', async () => {
      const nativeDir = servers.tempDir('conciv-vite-native-')
      const endpointDir = servers.tempDir('conciv-vite-endpoint-')
      writeFileSync(join(nativeDir, NATIVE_BUNDLE), 'globalThis.__conciv_native_loaded = true')

      const {server} = await servers.start(
        {widget: false, devEndpointDir: endpointDir},
        {
          serverExtensions: [],
          clientEntries: [],
          nativePageDir: nativeDir,
        },
      )

      const apiBase = await pageApiBase(server, '/native')
      const page = await fetch(`${apiBase}/native`)
      expect(page.status).toBe(200)
      const html = await page.text()
      expect(html).toContain('data-conciv-native-root')
      expect(html).toContain(`native/${NATIVE_BUNDLE}`)
      expect(existsSync(join(endpointDir, 'dev-endpoint.json'))).toBe(true)
    }, 30_000)
  })

  describe('widget boot in a host that installs conciv and its builtin extensions under node_modules, with no optimizeDeps.include', () => {
    const servers = devServers()
    const state: {started?: StartedDevServer; browser?: Browser; page?: Page; errors: string[]} = {errors: []}

    beforeAll(async () => {
      const root = servers.tempDir('conciv-vite-installed-')
      writeFileSync(
        join(root, 'index.html'),
        '<!doctype html><html><head><meta charset="utf-8"></head><body><p id="probe">probe</p><button id="counter" onclick="this.textContent = String(Number(this.textContent) + 1)">0</button></body></html>',
      )
      const embedDir = installConcivPackage(root, '@conciv/embed')
      const extensionDirs = BUILTIN_EXTENSIONS.map((name) => installConcivPackage(root, name))
      state.started = await servers.start(
        {devEndpointDir: servers.tempDir('conciv-vite-endpoint-')},
        {
          serverExtensions: [terminal, testRunner, whiteboard, recorder, ios],
          clientEntries: extensionDirs.map((dir) => join(dir, 'dist', 'client.js')),
          embedEntry: join(embedDir, 'dist', 'mount.js'),
          dedupeEntry: fileURLToPath(import.meta.resolve('@conciv/extension-compiler/dedupe')),
        },
        root,
      )
      state.browser = await chromium.launch({headless: true})
      state.page = await state.browser.newPage()
      state.page.on('console', (message) => {
        if (message.type() === 'error') state.errors.push(message.text())
      })
      state.page.on('pageerror', (error) => state.errors.push(error.message))
    }, 90_000)

    afterAll(async () => {
      await state.browser?.close()
      await servers.stopAll()
    })

    it('mounts the widget without a CommonJS interop error', async () => {
      const page = state.page
      const url = state.started?.server.resolvedUrls?.local[0]
      if (page === undefined || url === undefined) throw new Error('dev server did not start')
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

    it('opens the panel with the composer, so the embed shares the host Solid and extension singletons', async () => {
      const page = state.page
      if (page === undefined) throw new Error('dev server did not start')
      await page.getByRole('button', {name: /conciv chat$/}).click()
      await page.getByRole('dialog', {name: 'conciv chat agent'}).waitFor({timeout: 15_000})
      await page.getByRole('textbox', {name: 'Message the conciv agent'}).waitFor({timeout: 15_000})
      expect(state.errors).toEqual([])
    }, 30_000)

    it('restores the open chat, keeps it usable and names the content blocker when every rrweb module is blocked', async () => {
      const url = state.started?.server.resolvedUrls?.local[0]
      const blockedPage = await state.browser?.newPage()
      if (blockedPage === undefined || url === undefined) throw new Error('dev server did not start')
      await blockedPage.route(/rrweb/, (route) => route.abort('blockedbyclient'))
      await blockedPage.goto(url, {waitUntil: 'domcontentloaded'})
      const chat = blockedPage.getByRole('dialog', {name: 'conciv chat agent'})
      const composer = chat.getByRole('textbox', {name: 'Message the conciv agent'})
      await composer.fill('still usable', {timeout: 45_000})
      await expectLocator(composer).toHaveText('still usable')
      await chat.getByRole('tab', {name: /Recorder/}).click()
      await expectLocator(chat.getByText('Recording is paused by your content blocker')).toBeVisible()
      const outcome = await blockedPage.evaluate(() =>
        Reflect.get(window, '__CONCIV_PAGE_DRIVER__').execute({
          name: 'page_settext',
          input: {selector: '#probe', text: 'rewritten'},
        }),
      )
      await expectLocator(blockedPage.getByText(/content blocker.*rrweb-snapshot/)).toBeVisible()
      expect(outcome).toMatchObject({ok: true, capture: {after: {descriptor: {accessibleName: 'rewritten'}}}})
      expect(outcome.capture.after.node).toBeUndefined()
      await blockedPage.close()
    }, 90_000)

    it('runs a page tool once and promptly while rrweb-snapshot is still loading', async () => {
      const url = state.started?.server.resolvedUrls?.local[0]
      const slowPage = await state.browser?.newPage()
      if (slowPage === undefined || url === undefined) throw new Error('dev server did not start')
      await slowPage.route(/rrweb-snapshot/, () => new Promise<void>(() => {}))
      await slowPage.goto(url, {waitUntil: 'domcontentloaded'})
      await slowPage.getByRole('button', {name: /conciv chat$/}).waitFor({timeout: 45_000})
      const outcome = await slowPage.evaluate(() =>
        Promise.race([
          Reflect.get(window, '__CONCIV_PAGE_DRIVER__').execute({name: 'page_click', input: {selector: '#counter'}}),
          new Promise((resolve) => setTimeout(() => resolve('still waiting'), 2_000)),
        ]),
      )
      expect(outcome).toMatchObject({ok: true, capture: {after: {descriptor: {tagName: 'button'}}}})
      expect(outcome.capture.after.node).toBeUndefined()
      await expectLocator(slowPage.getByRole('button', {name: '1', exact: true})).toBeVisible()
      await slowPage.close()
    }, 90_000)

    it('retries a failed rrweb-snapshot load on the next page tool and names the content blocker once', async () => {
      const url = state.started?.server.resolvedUrls?.local[0]
      const blockedPage = await state.browser?.newPage()
      if (blockedPage === undefined || url === undefined) throw new Error('dev server did not start')
      const gate = {open: false}
      await blockedPage.route(/rrweb-snapshot/, (route) =>
        gate.open ? route.continue() : route.abort('blockedbyclient'),
      )
      await blockedPage.goto(url, {waitUntil: 'domcontentloaded'})
      const blockerNotice = blockedPage.getByText(/content blocker.*rrweb-snapshot/)
      await expectLocator(blockerNotice).toBeVisible({timeout: 45_000})
      await expectLocator(blockerNotice).toBeHidden()
      const rewrite = () =>
        blockedPage.evaluate(() =>
          Reflect.get(window, '__CONCIV_PAGE_DRIVER__').execute({
            name: 'page_settext',
            input: {selector: '#probe', text: 'rewritten'},
          }),
        )

      const importSettled = (href: string) =>
        blockedPage.evaluate(`import(${JSON.stringify(href)}).then(() => null, () => null)`)

      const stillBlocked = blockedPage.waitForEvent('requestfailed', (request) => /rrweb-snapshot/.test(request.url()))
      expect((await rewrite()).capture.after.node).toBeUndefined()
      const failedImport = (await stillBlocked).url()
      await importSettled(failedImport)
      expect(await blockerNotice.count()).toBe(0)

      gate.open = true
      const unblocked = blockedPage.waitForResponse(/rrweb-snapshot/)
      await rewrite()
      const loadedImport = (await unblocked).url()
      await importSettled(loadedImport)
      expect((await rewrite()).capture.after.node).toBeDefined()
      await blockedPage.close()
    }, 90_000)

    it('keeps recording and its actions when only the replay player is blocked', async () => {
      const url = state.started?.server.resolvedUrls?.local[0]
      const blockedPage = await state.browser?.newPage()
      if (blockedPage === undefined || url === undefined) throw new Error('dev server did not start')
      await blockedPage.route(/rrweb-player/, (route) => route.abort('blockedbyclient'))
      await blockedPage.goto(url, {waitUntil: 'domcontentloaded'})
      const chat = blockedPage.getByRole('dialog', {name: 'conciv chat agent'})
      await chat.getByRole('tab', {name: /Recorder/}).click({timeout: 45_000})
      await expectLocator(chat.getByText('Replay is paused by your content blocker.')).toBeVisible({timeout: 15_000})
      await expectLocator(chat.getByRole('button', {name: 'Send to agent'})).toBeVisible()
      await expectLocator(chat.getByText('Recording is paused by your content blocker')).toBeHidden()
      await blockedPage.close()
    }, 90_000)
  })
})

describe('nextjs config', () => {
  const SPECIFIER = '@conciv/app-extensions'
  const ENV_KEYS = ['NEXT_PUBLIC_CONCIV_PORT', 'CONCIV_OPTIONS'] as const

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
    projectRoot = mkdtempSync(join(tmpdir(), 'conciv-nextcfg-'))
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

  function generatedPath(): string {
    return join(process.cwd(), '.conciv', 'extensions-client.gen.tsx')
  }

  describe('withConciv bundler aliasing', () => {
    it('adds the turbopack resolveAlias while preserving the user turbopack config', () => {
      const cfg = withConciv({turbopack: {resolveAlias: {'user-lib': './user-lib'}, rules: {}}})
      expect(cfg.turbopack?.resolveAlias?.[SPECIFIER]).toBe('./.conciv/extensions-client.gen.tsx')
      expect(cfg.turbopack?.resolveAlias?.['user-lib']).toBe('./user-lib')
      expect(cfg.turbopack?.rules).toEqual({})
    })

    it('composes a webpack hook that aliases the absolute generated path and still runs the user hook on the aliased config', () => {
      const seen: WebpackConfig[] = []
      const userWebpack = (config: WebpackConfig): WebpackConfig => {
        seen.push(config)
        return config
      }
      const cfg = withConciv({webpack: userWebpack})
      const config: WebpackConfig = {resolve: {alias: {}}}
      const out = cfg.webpack?.(config, {})
      const aliasValue = out?.resolve?.alias?.[SPECIFIER]
      expect(aliasValue).toBe(generatedPath())
      expect(isAbsolute(generatedPath())).toBe(true)
      expect(seen).toHaveLength(1)
      expect(seen[0]?.resolve?.alias?.[SPECIFIER]).toBe(generatedPath())
    })

    it('aliases even when the user supplies no webpack hook', () => {
      const cfg = withConciv({})
      const config: WebpackConfig = {}
      const out = cfg.webpack?.(config, {})
      expect(out?.resolve?.alias?.[SPECIFIER]).toBe(generatedPath())
    })

    it('stubs the engine register entries to false in the edge compilation so node-only code is never bundled for edge', () => {
      const cfg = withConciv({})
      const edge = cfg.webpack?.({resolve: {alias: {}}}, {nextRuntime: 'edge'})
      expect(edge?.resolve?.alias?.['@conciv/it/plugin/nextjs']).toBe(false)
      expect(edge?.resolve?.alias?.['@conciv/plugin/nextjs']).toBe(false)
      expect(edge?.resolve?.alias?.[SPECIFIER]).toBe(generatedPath())
      const node = cfg.webpack?.({resolve: {alias: {}}}, {nextRuntime: 'nodejs'})
      expect(node?.resolve?.alias?.['@conciv/it/plugin/nextjs']).toBeUndefined()
      expect(node?.resolve?.alias?.['@conciv/plugin/nextjs']).toBeUndefined()
    })

    it('generates the client entry file when enabled', () => {
      const dir = join(process.cwd(), 'conciv', 'extensions')
      mkdirSync(dir, {recursive: true})
      writeFileSync(join(dir, 'tanstack.tsx'), 'export default {name: "tanstack"}')
      withConciv({})
      expect(existsSync(generatedPath())).toBe(true)
    })

    it('is a passthrough when disabled: no aliases, no generation', () => {
      const cfg = withConciv({reactStrictMode: true}, {enabled: false})
      expect(cfg.reactStrictMode).toBe(true)
      expect(cfg.turbopack).toBeUndefined()
      expect(cfg.webpack).toBeUndefined()
      expect(existsSync(generatedPath())).toBe(false)
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
const entry = await import('@conciv/plugin/nextjs')
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
    it('resolves to a register with no node builtins and no extension compiler in its module graph', () => {
      const probe = probeEdgeEntry()
      expect(probe.exports).toContain('register')
      expect(probe.resolved.filter((specifier) => specifier.startsWith('node:'))).toEqual([])
      expect(probe.resolved.filter((specifier) => specifier.includes('extension-compiler'))).toEqual([])
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

    it('is a passthrough when disabled', () => {
      const userConfig = {reactStrictMode: true}
      const cfg = withConciv(userConfig, {enabled: false})
      expect(cfg.reactStrictMode).toBe(true)
      expect(cfg.env?.NEXT_PUBLIC_CONCIV_PORT).toBeUndefined()
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

    it('does not touch process.env when disabled', () => {
      withConciv({}, {enabled: false, port: 6123})
      expect(process.env.NEXT_PUBLIC_CONCIV_PORT).toBeUndefined()
      expect(process.env.CONCIV_OPTIONS).toBeUndefined()
    })

    it('never assigns to a literal process.env.NEXT_PUBLIC_ member (bundlers inline it, breaking webpack)', () => {
      const source = readFileSync(fileURLToPath(new URL('../src/core/nextjs.ts', import.meta.url)), 'utf8')
      expect(source).not.toMatch(/process\.env\.NEXT_PUBLIC_\w+\s*(\?\?=|=[^=])/)
    })
  })
})

describe('widget inject', () => {
  const ENTRY = `<script type="module" src="${EXTENSIONS_ROUTE}"></script>`
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
      expect(html.indexOf(EXTENSIONS_ROUTE)).toBeLessThan(html.indexOf('</head>'))
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
      expect(html.indexOf(EXTENSIONS_ROUTE)).toBeLessThan(html.indexOf('</head>'))
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
      expect(body).not.toContain(EXTENSIONS_ROUTE)
    })

    it('does not double-inject when the html already references the client entry', async () => {
      const preinjected = `<html><head>${ENTRY}</head><body>x</body></html>`
      const {server, base} = await startServer(makeWidgetInject(API_BASE), (res) => {
        res.setHeader('content-type', 'text/html')
        res.end(preinjected)
      })
      state.server = server
      const html = await (await fetch(base)).text()
      const occurrences = html.split(`src="${EXTENSIONS_ROUTE}"`).length - 1
      expect(occurrences).toBe(1)
    })

    it('adds the missing settings meta when the html already references the client entry', async () => {
      const preinjected = `<html><head>${ENTRY}</head><body>x</body></html>`
      const {server, base} = await startServer(makeWidgetInject(API_BASE, {surface: 'dock'}), (res) => {
        res.setHeader('content-type', 'text/html')
        res.end(preinjected)
      })
      state.server = server
      const html = await (await fetch(base)).text()
      expect(html.split(`src="${EXTENSIONS_ROUTE}"`).length - 1).toBe(1)
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
  const servers: ViteDevServer[] = []
  const dirs = devServers()
  let browser: Browser

  beforeAll(async () => {
    browser = await chromium.launch({headless: true})
  })
  afterAll(async () => {
    await browser.close()
    await Promise.all(servers.map((server) => server.close()))
    await dirs.stopAll()
  })

  const realBuiltins: Builtins = {
    serverExtensions: [terminal, testRunner, whiteboard, recorder, ios],
    clientEntries: [
      '@conciv/extension-terminal/client',
      '@conciv/extension-test-runner/client',
      '@conciv/extension-whiteboard/client',
      '@conciv/extension-recorder/client',
      '@conciv/extension-ios/client',
    ].map((specifier) => fileURLToPath(import.meta.resolve(specifier))),
  }

  function linkConcivIt(root: string): void {
    const embedDir = dirname(dirname(realpathSync(fileURLToPath(import.meta.resolve('@conciv/embed')))))
    mkdirSync(join(root, 'node_modules', '@conciv'), {recursive: true})
    symlinkSync(join(dirname(embedDir), 'it'), join(root, 'node_modules', '@conciv', 'it'))
  }

  async function dockServer(
    widget?: false,
    builtins: Builtins = NO_BUILTINS,
    root = realpathSync(dirs.tempDir('conciv-dock-')),
    hostHead = '',
  ): Promise<string> {
    if (!existsSync(join(root, 'node_modules', '@conciv', 'it'))) linkConcivIt(root)
    writeFileSync(
      join(root, 'index.html'),
      `<!doctype html><html><head><meta charset="utf-8">${hostHead}<title>host</title></head><body><h1>host</h1></body></html>`,
    )
    const server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      server: {host: '127.0.0.1', port: 0},
      plugins: [
        makeViteHook(
          {enabled: true, stateRoot: root, ...(widget === false ? {widget} : {})},
          {
            ...builtins,
            embedEntry: fileURLToPath(import.meta.resolve('@conciv/embed')),
            dedupeEntry: fileURLToPath(import.meta.resolve('@conciv/extension-compiler/dedupe')),
          },
        ),
        DevTools({clientAuth: false}),
      ],
    })
    servers.push(server)
    await server.listen()
    const address = server.httpServer?.address()
    return `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/`
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

  it('fills the dock panel with the chat and the builtin extension tabs on a host with the real builtins', async () => {
    const page = await browser.newPage({viewport: {width: 1280, height: 800}})
    await page.goto(await dockServer(undefined, realBuiltins), {waitUntil: 'domcontentloaded'})
    await page.getByRole('button', {name: 'conciv'}).dispatchEvent('click')
    const chat = page.getByRole('dialog', {name: 'conciv chat agent'})
    await chat.getByRole('textbox', {name: 'Message the conciv agent'}).waitFor({timeout: 45_000})
    await expectLocator(chat.getByRole('tab', {name: /Recorder/})).toBeVisible()
    await expectLocator(chat.getByRole('tab', {name: /Terminal/})).toBeVisible()
    await page.close()
  }, 90_000)

  it('returns to the chat when the quick terminal opened by hotkey from a freshly opened dock chat closes', async () => {
    const page = await browser.newPage({viewport: {width: 1280, height: 800}})
    await page.goto(await dockServer(undefined, realBuiltins), {waitUntil: 'domcontentloaded'})
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
      await page.goto(await dockServer(undefined, realBuiltins), {waitUntil: 'domcontentloaded'})
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
    const root = realpathSync(dirs.tempDir('conciv-dock-'))
    writeFileSync(join(root, 'index.html'), '<!doctype html><meta charset="utf-8"><title>host</title>')
    const floating = await dirs.start(
      {},
      {
        ...NO_BUILTINS,
        embedEntry: fileURLToPath(import.meta.resolve('@conciv/embed')),
        dedupeEntry: fileURLToPath(import.meta.resolve('@conciv/extension-compiler/dedupe')),
      },
      root,
    )
    const floatingUrl = floating.server.resolvedUrls?.local[0]
    if (floatingUrl === undefined) throw new Error('dev server did not start')
    const floatingPage = await browser.newPage({viewport: {width: 1280, height: 800}})
    await floatingPage.goto(floatingUrl, {waitUntil: 'domcontentloaded'})
    await floatingPage.getByRole('button', {name: /conciv chat$/}).click({timeout: 45_000})
    const floatingComposer = floatingPage.getByRole('textbox', {name: 'Message the conciv agent'})
    await floatingComposer.waitFor()
    const closedPanelPersisted = floatingPage.waitForResponse(
      (response) =>
        response.url().endsWith('/rpc/navigation/set') &&
        /\/panel\/(?!latest)/.test(response.request().postData() ?? '') &&
        !(response.request().postData() ?? '').includes('open=true'),
    )
    await floatingComposer.press('Escape')
    await closedPanelPersisted
    await floatingPage.close()
    await floating.server.close()
    const page = await browser.newPage({viewport: {width: 1280, height: 800}})
    await page.goto(await dockServer(undefined, NO_BUILTINS, root), {waitUntil: 'domcontentloaded'})
    await page.getByRole('button', {name: 'conciv'}).dispatchEvent('click')
    await expectLocator(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible({timeout: 30_000})
    await page.close()
  }, 120_000)

  it('runs as the dock when the host html already carries a conciv-widget meta', async () => {
    const page = await browser.newPage({viewport: {width: 1280, height: 800}})
    const url = await dockServer(undefined, NO_BUILTINS, undefined, '<meta name="conciv-widget" content="{}">')
    await page.goto(url, {waitUntil: 'domcontentloaded'})
    await page.getByRole('button', {name: 'conciv'}).dispatchEvent('click')
    await expectLocator(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible({timeout: 30_000})
    expect(await page.getByRole('button', {name: /Open conciv chat|Close chat/}).count()).toBe(0)
    await page.close()
  }, 60_000)

  it('shows the inline chat after a pop-out started from the quick terminal of a closed widget closes', async () => {
    const {server} = await dirs.start(
      {},
      {
        ...realBuiltins,
        embedEntry: fileURLToPath(import.meta.resolve('@conciv/embed')),
        dedupeEntry: fileURLToPath(import.meta.resolve('@conciv/extension-compiler/dedupe')),
      },
      realpathSync(dirs.tempDir('conciv-quick-')),
    )
    writeFileSync(join(server.config.root, 'index.html'), '<!doctype html><meta charset="utf-8"><title>host</title>')
    const url = server.resolvedUrls?.local[0]
    if (url === undefined) throw new Error('dev server did not start')
    const page = await browser.newPage({viewport: {width: 1280, height: 800}})
    await page.goto(url, {waitUntil: 'domcontentloaded'})
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

  it('opens the chat and the recorder on a cold cache of an installed conciv without Vite re-optimizing dependencies', async () => {
    const root = realpathSync(dirs.tempDir('conciv-cold-'))
    writeFileSync(join(root, 'index.html'), '<!doctype html><meta charset="utf-8"><title>host</title>')
    const installed = join(installConcivPackage(root, '@conciv/embed'), '..')
    for (const name of ['terminal', 'test-runner', 'whiteboard', 'recorder', 'ios']) {
      installConcivPackage(root, `@conciv/extension-${name}`)
    }
    const workspaceIt = join(
      dirname(dirname(dirname(realpathSync(fileURLToPath(import.meta.resolve('@conciv/embed')))))),
      'it',
    )
    cpSync(join(workspaceIt, 'package.json'), join(installed, 'it', 'package.json'))
    const logged: string[] = []
    const remember = (message: string): void => void logged.push(message)
    const server = await createServer({
      root,
      configFile: false,
      customLogger: {...createLogger('silent'), info: remember, warn: remember, warnOnce: remember},
      server: {host: '127.0.0.1', port: 0},
      plugins: [
        makeViteHook(
          {enabled: true, stateRoot: root},
          {
            serverExtensions: realBuiltins.serverExtensions,
            clientEntries: ['terminal', 'test-runner', 'whiteboard', 'recorder', 'ios'].map((name) =>
              join(installed, `extension-${name}`, 'dist', 'client.js'),
            ),
            embedEntry: join(installed, 'embed', 'dist', 'mount.js'),
            dedupeEntry: fileURLToPath(import.meta.resolve('@conciv/extension-compiler/dedupe')),
          },
        ),
      ],
    })
    servers.push(server)
    await server.listen()
    const url = server.resolvedUrls?.local[0]
    if (url === undefined) throw new Error('dev server did not start')
    const page = await browser.newPage({viewport: {width: 1280, height: 800}})
    const gatewayFailures: string[] = []
    page.on('response', (response) => {
      if (response.status() === 504) gatewayFailures.push(response.url())
    })
    const recorderPlayer = page.waitForResponse(/rrweb-player/, {timeout: 60_000})
    await page.goto(url, {waitUntil: 'domcontentloaded'})
    await page.getByRole('button', {name: /conciv chat$/}).click({timeout: 45_000})
    const chat = page.getByRole('dialog', {name: 'conciv chat agent'})
    await chat.getByRole('textbox', {name: 'Message the conciv agent'}).waitFor({timeout: 15_000})
    await chat.getByRole('tab', {name: /Recorder/}).click()
    await recorderPlayer
    expect(logged.filter((line) => /Failed to resolve dependency|optimized dependencies changed/.test(line))).toEqual(
      [],
    )
    expect(gatewayFailures).toEqual([])
    await page.close()
  }, 120_000)

  it('keeps the floating page widget when Vite DevTools is not enabled', async () => {
    const {server} = await dirs.start()
    servers.push(server)
    const address = server.httpServer?.address()
    const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
    const source = await (await fetch(`${base}${EXTENSIONS_ROUTE}`)).text()
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

    async function openDockChat(page: Page): Promise<void> {
      await page.getByRole('button', {name: 'conciv'}).dispatchEvent('click')
      await page.getByRole('dialog', {name: 'conciv chat agent'}).getByRole('textbox', {name: composerName}).waitFor()
    }

    async function popOut(page: Page): Promise<Page> {
      await page.getByRole('button', {name: 'Session options'}).click()
      const popup = page.waitForEvent('popup')
      const persisted = page.waitForResponse(
        (response) =>
          response.url().endsWith('/rpc/navigation/set') && (response.request().postData() ?? '').includes('/pip/'),
      )
      await page.getByRole('button', {name: 'Pop out to a window'}).click()
      const popupPage = await popup
      await persisted
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
      const page = await browser.newPage({viewport: {width: 1280, height: 800}})
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
      const page = await browser.newPage({viewport: {width: 1280, height: 800}})
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
      const page = await browser.newPage({viewport: {width: 1280, height: 800}})
      await page.goto(await dockServer(), {waitUntil: 'domcontentloaded'})
      await openDockChat(page)
      const popupPage = await popOut(page)
      await page.reload({waitUntil: 'domcontentloaded'})
      await expectLocator(page.getByText('Chat is popped out')).toBeVisible({timeout: 20_000})
      await expectWorkingComposer(popupPage)
      await page.close()
    }, 60_000)

    it('returns to the inline chat when the user closes the pop-out after a reload', async () => {
      const page = await browser.newPage({viewport: {width: 1280, height: 800}})
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
      const first = await browser.newPage({viewport: {width: 1280, height: 800}})
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

describe('extension load isolation', () => {
  const servers: ViteDevServer[] = []
  const dirs = devServers()
  let browser: Browser

  beforeAll(async () => {
    browser = await chromium.launch({headless: true})
  })
  afterAll(async () => {
    await browser.close()
    await Promise.all(servers.map((server) => server.close()))
    await dirs.stopAll()
  })

  it('mounts the widget and names the extension whose module a content blocker refused', async () => {
    const root = realpathSync(dirs.tempDir('conciv-isolation-'))
    writeFileSync(join(root, 'index.html'), '<!doctype html><meta charset="utf-8"><title>host</title><h1>host</h1>')
    const blockedEntry = join(root, 'blocked-extension.js')
    writeFileSync(blockedEntry, "export default {name: 'blocked'}\n")
    const server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      server: {host: '127.0.0.1', port: 0},
      plugins: [
        makeViteHook(
          {enabled: true, stateRoot: root},
          {
            ...NO_BUILTINS,
            clientEntries: [blockedEntry],
            embedEntry: fileURLToPath(import.meta.resolve('@conciv/embed')),
            dedupeEntry: fileURLToPath(import.meta.resolve('@conciv/extension-compiler/dedupe')),
          },
        ),
      ],
    })
    servers.push(server)
    await server.listen()
    const address = server.httpServer?.address()
    const page = await browser.newPage()
    await page.route(/blocked-extension\.js/, (route) => route.abort('blockedbyclient'))
    await page.goto(`http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/`, {
      waitUntil: 'domcontentloaded',
    })
    const notice = page.getByText(/blocked-extension.*failed to load.*content blocker/)
    const shown = notice.waitFor({timeout: 45_000})
    await page.getByRole('button', {name: /conciv chat$/}).waitFor({timeout: 45_000})
    await shown
    await page.close()
  }, 60_000)
})
