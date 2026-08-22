import {fileURLToPath} from 'node:url'
import type {Page} from 'playwright'
import {afterAll, beforeAll} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import {getExtensionTestApi, serveDir, type ExtensionTestApi} from '@conciv/extension-testkit'
import {awaitPagePlaneSubscribed} from '@conciv/extension-testkit/page-plane'
import type {FrameworkAdapter} from '@conciv/protocol/framework-types'
import type {ServerToolRegistryAccess} from '@conciv/extension/registry'
import tanstackExtension from '../../src/server.js'

const hostDist = fileURLToPath(new URL('../../dist/test-host', import.meta.url))

export type TanstackTestApi = {api: ExtensionTestApi; origin: string}

export function useTanstackTestApi(): () => TanstackTestApi {
  const ctx: {api?: ExtensionTestApi; origin?: string} = {}
  beforeAll(async () => {
    ctx.api = await getExtensionTestApi({
      server: tanstackExtension,
      host: async ({apiBase, session}) => {
        const served = await serveDir(hostDist, {apiBase, session})
        ctx.origin = served.origin
        return {origin: served.origin, close: () => served.close()}
      },
    })
  }, 120_000)
  afterAll(async () => ctx.api?.dispose())
  return () => {
    if (!ctx.api || ctx.origin === undefined) throw new Error('testkit not booted')
    return {api: ctx.api, origin: ctx.origin}
  }
}

function hasAdapterFactory(
  context: unknown,
): context is {makeAdapter: (tools: ServerToolRegistryAccess) => FrameworkAdapter} {
  return (
    typeof context === 'object' &&
    context !== null &&
    'makeAdapter' in context &&
    typeof context.makeAdapter === 'function'
  )
}

export function tanstackAdapter(api: ExtensionTestApi): FrameworkAdapter {
  const context = api.serverContext
  if (!hasAdapterFactory(context)) {
    throw new Error('tanstack adapter factory missing from server context')
  }
  return context.makeAdapter({call: (name, input) => api.callTool(name, input)})
}

export async function waitForWidget(page: Page): Promise<void> {
  await awaitPagePlaneSubscribed(page, () =>
    expectLocator(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: 30_000}),
  )
}

export async function gotoAbout(page: Page): Promise<void> {
  await page.getByRole('link', {name: 'About'}).click()
  await expectLocator(page.getByRole('heading', {name: 'About this app'})).toBeVisible()
}

export async function waitForAboutQuery(page: Page): Promise<void> {
  await expectLocator(page.getByText('Query fetched: yes')).toBeVisible({timeout: 10_000})
}
