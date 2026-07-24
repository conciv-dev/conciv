import {afterEach, describe, expect, it} from 'vitest'
import {EventEmitter} from 'node:events'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import type {ViteDevServer} from 'vite'
import {makeViteHook} from '../src/core/vite.js'

const NATIVE_BUNDLE = 'conciv-widget-native.global.js'

type HtmlTag = {tag: string; attrs?: Record<string, string>}

function fakeViteServer(root: string): {server: ViteDevServer; httpServer: EventEmitter} {
  const httpServer = new EventEmitter()
  const server = {
    config: {root},
    middlewares: {stack: [] as unknown[]},
    environments: {client: {hot: {send: () => {}}}},
    watcher: {on: () => {}},
    moduleGraph: {getModulesByFile: () => undefined},
    resolvedUrls: {local: [], network: []},
    httpServer,
  } as unknown as ViteDevServer
  return {server, httpServer}
}

function enginePort(hook: ReturnType<typeof makeViteHook>, server: ViteDevServer): number {
  const transform = hook.transformIndexHtml
  const handler = typeof transform === 'function' ? transform : transform?.handler
  if (!handler) throw new Error('conciv plugin has no transformIndexHtml')
  const tags = handler.call({} as never, '', {server} as never) as HtmlTag[]
  const apiBase = tags.find((tag) => tag.attrs?.name === 'pw-api-base')?.attrs?.content
  const port = apiBase ? Number(new URL(apiBase).port) : NaN
  if (!Number.isInteger(port)) throw new Error(`no engine port injected, got ${apiBase}`)
  return port
}

describe('dev core booted through the vite plugin', () => {
  const state = {httpServer: undefined as EventEmitter | undefined, dirs: [] as string[]}

  afterEach(async () => {
    state.httpServer?.emit('close')
    state.httpServer = undefined
    await new Promise((resolve) => setTimeout(resolve, 300))
    for (const dir of state.dirs) rmSync(dir, {recursive: true, force: true})
    state.dirs = []
  })

  it('serves /native because configureServer threads the native page dir into the engine', async () => {
    const root = mkdtempSync(join(tmpdir(), 'conciv-vite-root-'))
    const nativeDir = mkdtempSync(join(tmpdir(), 'conciv-vite-native-'))
    state.dirs = [root, nativeDir]
    writeFileSync(join(nativeDir, NATIVE_BUNDLE), 'globalThis.__conciv_native_loaded = true')

    const hook = makeViteHook(
      {enabled: true, stateRoot: root, widget: false},
      {serverExtensions: [], clientEntries: [], nativePageDir: nativeDir},
    )
    const {server, httpServer} = fakeViteServer(root)
    state.httpServer = httpServer

    const configureServer = hook.configureServer
    const run = typeof configureServer === 'function' ? configureServer : configureServer?.handler
    if (!run) throw new Error('conciv plugin has no configureServer')
    await run.call({} as never, server)

    const port = enginePort(hook, server)
    const page = await fetch(`http://127.0.0.1:${port}/native`)
    expect(page.status).toBe(200)
    const html = await page.text()
    expect(html).toContain('data-conciv-native-root')
    expect(html).toContain(`native/${NATIVE_BUNDLE}`)
  }, 30_000)
})
