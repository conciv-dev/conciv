import {fileURLToPath} from 'node:url'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import {chromium, type Browser, type Page} from 'playwright'
import {z} from 'zod'
import {bootCoreKit, type CoreKit} from '@conciv/extension-testkit/core-kit'
import {completeConnectHandshake} from '@conciv/extension-testkit/connect-handshake'
import {serveDir} from '@conciv/extension-testkit'
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

let browser: Browser
let kit: CoreKit
let host: {origin: string; close: () => Promise<void>}
let page: Page

describe('bootConnect: the tanstack client verbs answer the registry through the connect handle', () => {
  beforeAll(async () => {
    browser = await chromium.launch()
    kit = await bootCoreKit({id: 'fake-tanstack', extensions: [tanstackExtension]})
    host = await serveDir(hostDist, {apiBase: '', session: await kit.session()})
    page = await browser.newPage()
    await page.goto(host.origin, {waitUntil: 'domcontentloaded'})
    await page.getByRole('button', {name: 'Open conciv chat'}).click({timeout: 30_000})
    await completeConnectHandshake(page, kit.base)
  }, 120_000)

  afterAll(async () => {
    await page.close()
    await host.close()
    await kit.cleanup()
    await browser.close()
  })

  it('tanstack.routerState reads the live TanStack app the connect handle attached to', async () => {
    await page.getByRole('link', {name: 'About'}).click()
    await expectLocator(page.getByRole('heading', {name: 'About this app'})).toBeVisible()

    const state = routerStateSchema.parse(await kit.rpc.registry.call({name: 'tanstack.routerState', input: {}}))

    expect(state.result.location.pathname).toBe('/about')
    const aboutMatch = state.result.matches.find((match) => match.routeId === '/about')
    if (!aboutMatch) throw new Error('the router state did not list the /about match')
    const loaderData = loaderDataSchema.parse(aboutMatch.loaderData)
    expect(loaderData.server.greeting).toBe('hello')
    expect(loaderData.local.n).toBe(42)
  })
})
