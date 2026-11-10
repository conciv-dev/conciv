import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import type {Browser} from 'playwright'
import type {ViteDevServer} from 'vite'
import {z} from 'zod'
import {makeRpcClient} from '@conciv/contract'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {awaitPagePlaneSubscribed} from '@conciv/extension-testkit/page-plane'
import {magicLink} from '@conciv/harness-testkit/login'
import {DESIGN_TOOLS} from '@conciv/extension-design/design-tools'
import {injectWidget} from './inject-widget.js'

export async function open(input: {
  options: {route: string; width: number; height: number; colorScheme: 'light' | 'dark'; model?: string}
  server: ViteDevServer
  browser: Browser
  devEndpointDir: string
  target: z.input<typeof getDef.inputSchema>
  printed: string[]
}) {
  const local = input.server.resolvedUrls?.local[0]
  if (local === undefined) throw new Error('the fixture dev server has no local url')
  const endpoint = await readFile(join(input.devEndpointDir, ENDPOINT_FILE), 'utf8')
  const {apiBase} = EndpointSchema.parse(JSON.parse(endpoint))
  const session = (await makeRpcClient(apiBase).sessions.resolve({})).sessionId
  const rpc = makeRpcClient(apiBase, {headers: {[CONCIV_SESSION_HEADER]: session}})
  if (input.options.model !== undefined) await rpc.sessions.model({sessionId: session, model: input.options.model})
  const page = await input.browser.newPage({
    viewport: {width: input.options.width, height: input.options.height},
    colorScheme: input.options.colorScheme,
  })
  const route = await magicLink(new URL(apiBase).origin, () => input.printed.join('\n'), input.options.route)
  await awaitPagePlaneSubscribed(page, async () => {
    await page.goto(new URL(route, new URL(local).origin).href, {waitUntil: 'domcontentloaded'})
    await injectWidget({page, apiBase: new URL(apiBase).origin})
    await page.waitForFunction(() => '__CONCIV_PAGE_DRIVER__' in window, undefined, {timeout: PAGE_DRIVER_TIMEOUT_MS})
  })
  const outputSchema = getDef.outputSchema
  if (outputSchema === undefined) throw new Error('the design tool declares no output schema')
  const registered = outputSchema.parse(await rpc.registry.call({name: getDef.name, input: input.target}))
  const frames = 'variants' in registered ? registered.variants : [registered]
  const [first] = frames
  if (first === undefined) throw new Error('design_get registered no frame')
  process.stdout.write(
    `target ${first.target} ${first.viewport.width}x${first.viewport.height}` +
      ` nodes ${first.count} tab ${input.options.width}` +
      (frames.length > 1
        ? ` variants ${frames.map((frame) => `${frame.target}@${frame.viewport.width}`).join(',')}`
        : '') +
      '\n',
  )
  return {rpc, page, id: first.target, session, apiBase}
}

const ENDPOINT_FILE = 'dev-endpoint.json'
const PAGE_DRIVER_TIMEOUT_MS = 30_000
const EndpointSchema = z.object({apiBase: z.string().min(1)})
const [getDef] = DESIGN_TOOLS
