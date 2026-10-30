import {afterAll, afterEach, beforeAll, describe, expect, it} from 'vitest'
import {existsSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium, type Browser, type Page} from 'playwright'
import terminal from '@conciv/extension-terminal'
import testRunner from '@conciv/extension-test-runner'
import whiteboard from '@conciv/extension-whiteboard'
import recorder from '@conciv/extension-recorder'
import ios from '@conciv/extension-ios'
import {devServers, installConcivPackage, pageApiBase, type StartedDevServer} from './helpers/dev-servers.js'

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
      '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>',
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
})
