import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import type {Page} from 'playwright'
import {z} from 'zod'
import {concivStateDir} from '@conciv/protocol/state-types'

const EndpointSchema = z.object({mcpUrl: z.url(), token: z.string().min(1)})

export async function trustedApiBase(root: string): Promise<string> {
  const file = join(concivStateDir(root), 'mcp-endpoint.json')
  const endpoint = EndpointSchema.parse(JSON.parse(await readFile(file, 'utf8')))
  return `${new URL(endpoint.mcpUrl).origin}/t/${endpoint.token}`
}

export async function trustedTab(page: Page, options: {root: string}): Promise<string> {
  const apiBase = await trustedApiBase(options.root)
  await page.addInitScript((base) => Reflect.set(window, '__CONCIV_API_BASE__', base), apiBase)
  return apiBase
}
