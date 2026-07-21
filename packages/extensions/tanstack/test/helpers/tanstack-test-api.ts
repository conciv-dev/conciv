import {rm} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import type {Page} from 'playwright'
import react from '@vitejs/plugin-react'
import {afterAll, beforeAll, expect} from 'vitest'
import {buildConcivHost, getExtensionTestApi, serveDir, type ExtensionTestApi} from '@conciv/extension-testkit'
import type {FrameworkAdapter} from '@conciv/protocol/framework-types'
import tanstackExtension from '../../src/server.js'

const hostDir = fileURLToPath(new URL('../host', import.meta.url))
const clientEntry = fileURLToPath(new URL('../../dist/client.js', import.meta.url))

export type TanstackTestApi = {api: ExtensionTestApi; origin: string}

export function useTanstackTestApi(): () => TanstackTestApi {
  const ctx: {api?: ExtensionTestApi; origin?: string} = {}
  beforeAll(async () => {
    ctx.api = await getExtensionTestApi({
      server: tanstackExtension,
      host: async ({apiBase, session}) => {
        const outDir = await buildConcivHost({root: hostDir, plugins: [react()], clientEntry})
        const served = await serveDir(outDir, {apiBase, session})
        ctx.origin = served.origin
        return {
          origin: served.origin,
          close: async () => {
            await served.close()
            await rm(outDir, {recursive: true, force: true}).catch(() => {})
          },
        }
      },
    })
  }, 120_000)
  afterAll(async () => ctx.api?.dispose())
  return () => {
    if (!ctx.api || ctx.origin === undefined) throw new Error('testkit not booted')
    return {api: ctx.api, origin: ctx.origin}
  }
}

export function tanstackAdapter(api: ExtensionTestApi): FrameworkAdapter {
  const context = api.serverContext
  if (typeof context !== 'object' || context === null || !('adapter' in context)) {
    throw new Error('tanstack adapter missing from server context')
  }
  return context.adapter as FrameworkAdapter
}

export async function waitForWidget(page: Page): Promise<void> {
  await expect
    .poll(() => page.getByRole('button', {name: 'Open conciv chat'}).isVisible(), {timeout: 30_000})
    .toBe(true)
}

export async function gotoAbout(page: Page): Promise<void> {
  await page.getByRole('link', {name: 'About'}).click()
  await expect.poll(() => page.getByRole('heading', {name: 'About this app'}).isVisible()).toBe(true)
}

export async function waitForAboutQuery(page: Page): Promise<void> {
  await expect.poll(() => page.getByText('Query fetched: yes').isVisible(), {timeout: 10_000}).toBe(true)
}
