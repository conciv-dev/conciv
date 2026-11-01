/// <reference lib="dom" />
import {createServer} from 'node:http'
import {fileURLToPath} from 'node:url'
import {getTempAuthCode} from 'devframe/node/auth'
import type {Browser, Frame, Page} from 'playwright'
import {build, type Rollup} from 'vite'

const PROBE_MODULE = 'conciv-probe-entry'
const PROBE_SOURCE = `
import {getDevframeRpcClient} from 'devframe/client'
import {browserClient, readSharedState} from '@conciv/extension/devframe-connection'
import {concivCall} from '@conciv/extension'
Object.assign(window, {concivProbe: {getDevframeRpcClient, browserClient, readSharedState, concivCall}})
`

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))

export type ConcivProbe = {
  getDevframeRpcClient: typeof import('devframe/client').getDevframeRpcClient
  browserClient: typeof import('@conciv/extension/devframe-connection').browserClient
  readSharedState: typeof import('@conciv/extension/devframe-connection').readSharedState
  concivCall: typeof import('@conciv/extension').concivCall
}

declare global {
  interface Window {
    concivProbe: ConcivProbe
    concivConnection: ReturnType<ConcivProbe['browserClient']>
  }
}

function chunkCode(outputs: Rollup.RollupOutput[]): string {
  const chunk = outputs.flatMap((result) => result.output).find((item) => item.type === 'chunk')
  if (!chunk || chunk.type !== 'chunk') throw new Error('the devframe probe built no chunk')
  return chunk.code
}

async function bundleProbe(): Promise<string> {
  const built = await build({
    root: PACKAGE_ROOT,
    configFile: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'conciv-probe',
        resolveId: (id) => (id.endsWith(PROBE_MODULE) ? PROBE_MODULE : null),
        load: (id) => (id === PROBE_MODULE ? PROBE_SOURCE : null),
      },
    ],
    build: {
      write: false,
      minify: false,
      lib: {entry: PROBE_MODULE, formats: ['es'], fileName: 'probe'},
      rolldownOptions: {output: {inlineDynamicImports: true}},
    },
  })
  if (!('output' in built) && !Array.isArray(built)) throw new Error('the devframe probe build returned a watcher')
  return chunkCode(Array.isArray(built) ? built : [built])
}

export type ProbeHost = {url: string; close: () => Promise<void>}

const probeBuilds: {current?: Promise<string>} = {}

export function probeScript(): Promise<string> {
  probeBuilds.current ??= bundleProbe()
  return probeBuilds.current
}

export async function serveProbeHost(): Promise<ProbeHost> {
  const script = await probeScript()
  const server = createServer((request, response) => {
    if (request.url === '/probe.js') {
      response.writeHead(200, {'content-type': 'text/javascript'})
      response.end(script)
      return
    }
    response.writeHead(200, {'content-type': 'text/html; charset=utf-8'})
    response.end('<!doctype html><title>probe</title><script type="module" src="/probe.js"></script>')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (typeof address !== 'object' || address === null) throw new Error('the probe host has no port')
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}

export async function probeTab(browser: Browser, hostUrl: string, hubUrl: string): Promise<Page> {
  const page = await browser.newPage()
  await page.goto(hostUrl, {waitUntil: 'domcontentloaded'})
  await page.waitForFunction(() => 'concivProbe' in window)
  await page.evaluate(async (baseURL) => {
    window.concivConnection = window.concivProbe.browserClient({baseURL})
    await window.concivConnection.ready()
  }, hubUrl)
  return page
}

export async function loginTab(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const client = await window.concivConnection.ready()
    await client.requestAuthCode()
  })
  const trusted = await page.evaluate(
    async (code) => (await window.concivConnection.ready()).requestTrustWithCode(code),
    getTempAuthCode(),
  )
  if (!trusted) throw new Error('the one-time code did not trust the tab')
}

export async function trustedTab(browser: Browser, hostUrl: string, hubUrl: string): Promise<Page> {
  const page = await probeTab(browser, hostUrl, hubUrl)
  await loginTab(page)
  return page
}

export async function pluginFrame(page: Page, frameUrl: string, script: string): Promise<Frame> {
  const element = await page.evaluateHandle((url) => {
    const iframe = document.createElement('iframe')
    iframe.src = url
    document.body.append(iframe)
    return iframe
  }, frameUrl)
  const handle = element.asElement()
  const frame = handle && (await handle.contentFrame())
  if (!frame) throw new Error('the plugin iframe has no frame')
  await frame.waitForLoadState('domcontentloaded')
  await frame.addScriptTag({content: script, type: 'module'})
  await frame.waitForFunction(() => 'concivProbe' in window)
  return frame
}
