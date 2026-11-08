import {defineExtension, toolError, type ServerVerb} from '@conciv/extension'
import type {SessionId} from '@conciv/protocol/chat-types'
import {captureDef, routeDef, screenshotNodeDef} from '@conciv/extension-page/defs'
import {z} from 'zod'
import {cdpDriver} from './server/drivers/cdp.js'

const BrowserDriverConfigSchema = z.object({
  endpoint: z.string().optional().describe('the debugging endpoint of the browser that shows the page: http or ws'),
  driver: z.enum(['cdp', 'bidi']).default('cdp'),
  scale: z.number().positive().default(1).describe('device pixels per css pixel when a verb names no scale'),
})

const RouteSchema = z.object({href: z.string()})

export default defineExtension({
  name: 'browser-driver',
  configSchema: BrowserDriverConfigSchema,
}).server((server) => {
  const {endpoint, driver, scale} = server.config
  if (endpoint === undefined) return {context: null}
  if (driver === 'bidi')
    throw toolError('driver-unavailable', {message: 'the bidi driver is not built yet; set driver to cdp'})
  const browser = cdpDriver({endpoint})
  const href = async (sessionId: SessionId): Promise<string> =>
    RouteSchema.parse(await server.page.ask({sessionId, name: routeDef.name, input: {}})).href
  const scaled = (input: Record<string, unknown>): number =>
    typeof input['scale'] === 'number' ? input['scale'] : scale
  const verbs: Record<string, ServerVerb> = {
    [captureDef.name]: async (input, {sessionId}) => {
      const parsed = captureDef.inputSchema.parse(input)
      return browser.capture({...parsed, scale: scaled(input), href: await href(sessionId)})
    },
    [screenshotNodeDef.name]: async (input, {sessionId}) => {
      const parsed = screenshotNodeDef.inputSchema.parse(input)
      return browser.node({...parsed, scale: scaled(input), href: await href(sessionId)})
    },
  }
  return {context: null, verbs, dispose: browser.close}
})
