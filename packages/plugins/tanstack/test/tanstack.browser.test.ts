import {readdirSync, symlinkSync, writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import type {Browser} from 'playwright'
import {build} from 'vite'
import {describe, onTestFinished} from 'vitest'
import {expect} from '@playwright/test'
import {z} from 'zod'
import {test} from '@conciv/browser-fixture'
import {magicLink} from '@conciv/harness-testkit/login'
import {bootCoreKit, type CoreKit} from '@conciv/plugin-testkit/core-kit'
import {serveStaticDir} from '@conciv/plugin-testkit/widget-suite'
import {tempDir} from '@conciv/vitest-config/temp-dir'

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url))
const HOST_ENTRY = fileURLToPath(new URL('./host/app.ts', import.meta.url))
const WIDGET_DIR = dirname(createRequire(import.meta.url).resolve('@conciv/embed'))
const CHIP = 'TanStack inspector active'

const RouterStateSchema = z.object({
  location: z.object({pathname: z.string(), search: z.string(), hash: z.string()}),
  matches: z.array(z.object({routeId: z.string()})),
})

const ControlSchema = z.object({type: z.string(), connectionId: z.string()})

async function hostFolder(apiBase: string, withApp: boolean): Promise<string> {
  const folder = tempDir('conciv-tanstack-host-')
  if (withApp)
    await build({
      configFile: false,
      logLevel: 'silent',
      mode: 'production',
      build: {
        outDir: folder,
        emptyOutDir: false,
        rollupOptions: {input: HOST_ENTRY, output: {format: 'es', entryFileNames: 'app.js'}},
      },
    })
  readdirSync(WIDGET_DIR).forEach((entry) => symlinkSync(join(WIDGET_DIR, entry), join(folder, entry)))
  const app = withApp ? '<script type="module" src="/app.js"></script>' : ''
  writeFileSync(
    join(folder, 'index.html'),
    `<!doctype html><html><head>
    <meta charset="utf-8">
    <title>TanStack host</title>
    <meta name="conciv-api-base" content="${apiBase}">
    <meta name="conciv-widget" content='{}'>
  </head><body>
    <div id="root"></div>
    ${app}
    <script src="/conciv-widget.global.js"></script>
  </body></html>`,
  )
  return folder
}

async function attachedControls(kit: CoreKit): Promise<() => Promise<string>> {
  const closing = new AbortController()
  onTestFinished(() => closing.abort())
  const stream = await kit.rpc.event.subscribe({types: ['rpc.experimental.tanstack.control']}, {signal: closing.signal})
  const next = async (): Promise<string> => {
    const frame = await stream.next()
    if (frame.done) throw new Error('the control stream ended')
    const control = ControlSchema.safeParse(frame.value.data)
    if (control.success && control.data.type === 'attached') return control.data.connectionId
    return next()
  }
  return next
}

async function openHost(browser: Browser, kit: CoreKit, withApp: boolean) {
  const host = await serveStaticDir(await hostFolder(kit.origin, withApp))
  onTestFinished(() => host.close())
  const page = await browser.newPage()
  onTestFinished(() => page.close())
  await page.goto(await magicLink(kit.base, `${host.base}/`), {waitUntil: 'domcontentloaded'})
  await page.getByRole('button', {name: 'Open conciv chat'}).click({timeout: 30_000})
  return page
}

describe('the tanstack plugin in the page', () => {
  test('shows its chip in the session status and answers router_state with the real location', async ({browser}) => {
    const kit = await bootCoreKit({id: 'fake', plugins: [PACKAGE_DIR]})
    onTestFinished(() => kit.cleanup())
    const attached = await attachedControls(kit)

    const page = await openHost(browser, kit, true)
    await expect(page.getByRole('heading', {name: 'TanStack inspection home'})).toBeVisible({timeout: 30_000})
    await expect(page.getByRole('status', {name: CHIP})).toBeVisible({timeout: 30_000})
    await attached()

    const state = RouterStateSchema.parse(await kit.callTool('tanstack_router_state', {}))
    expect(state.location.pathname).toBe('/')
    expect(state.matches.map((match) => match.routeId)).toEqual(['__root__', '/'])
  })
})
