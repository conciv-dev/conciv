import {fileURLToPath} from 'node:url'
import {expect} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import type {Page} from 'playwright'
import {z} from 'zod'
import {test as browserTest} from '@conciv/browser-fixture'
import {bootCoreKit, type CoreKit} from '@conciv/extension-testkit/core-kit'
import {completeConnectHandshake} from '@conciv/extension-testkit/connect-handshake'
import {serveDir, type ServedHost} from '@conciv/extension-testkit'
import tanstackExtension from '../src/server.js'

const hostDist = fileURLToPath(new URL('../dist/test-host', import.meta.url))

const routerStateSchema = z.object({
  result: z.object({
    location: z.object({pathname: z.string(), search: z.string(), hash: z.string()}),
    matches: z.array(z.looseObject({routeId: z.string(), path: z.string(), loaderData: z.unknown()})),
  }),
})

const loaderDataSchema = z.looseObject({
  server: z.looseObject({greeting: z.string()}),
  local: z.looseObject({n: z.number()}),
})

const CONNECT_SETUP_TIMEOUT_MS = 120_000

const test = browserTest.extend<{$file: {kit: CoreKit; host: ServedHost; connectedPage: Page}}>({
  kit: [
    // oxlint-disable-next-line no-empty-pattern -- vitest's fixture parser requires the literal `{}` destructuring
    async ({}, use) => {
      const kit = await bootCoreKit({id: 'fake-tanstack', extensions: [tanstackExtension]})
      await use(kit)
      await kit.cleanup()
    },
    {scope: 'file'},
  ],
  host: [
    async ({kit}, use) => {
      const host = await serveDir(hostDist, {apiBase: '', session: await kit.session()})
      await use(host)
      await host.close()
    },
    {scope: 'file'},
  ],
  connectedPage: [
    async ({browser, host, kit}, use) => {
      const page = await browser.newPage()
      await page.goto(host.origin, {waitUntil: 'domcontentloaded'})
      await page.getByRole('button', {name: 'Open conciv chat'}).click({timeout: 30_000})
      await completeConnectHandshake(page, kit.base, await kit.session())
      await use(page)
      await page.close()
    },
    {scope: 'file'},
  ],
})

test.describe('bootConnect: the tanstack client verbs answer the registry through the connect handle', () => {
  test(
    'tanstack_router_state reads the live TanStack app the connect handle attached to',
    async ({connectedPage, kit}) => {
      await connectedPage.getByRole('link', {name: 'About'}).click()
      await expectLocator(connectedPage.getByRole('heading', {name: 'About this app'})).toBeVisible()

      const state = routerStateSchema.parse(await kit.rpc.registry.call({name: 'tanstack_router_state', input: {}}))

      expect(state.result.location.pathname).toBe('/about')
      const aboutMatch = state.result.matches.find((match) => match.routeId === '/about')
      if (!aboutMatch) throw new Error('the router state did not list the /about match')
      const loaderData = loaderDataSchema.parse(aboutMatch.loaderData)
      expect(loaderData.server.greeting).toBe('hello')
      expect(loaderData.local.n).toBe(42)
    },
    CONNECT_SETUP_TIMEOUT_MS,
  )
})
