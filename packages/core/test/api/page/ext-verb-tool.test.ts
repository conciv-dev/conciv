import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {
  defineExtension,
  defineTool,
  isPageVerbError,
  noWidgetPageCaller,
  pageVerb,
  type PageCaller,
} from '@conciv/extension'
import {buildExtensionTools} from '../../../src/app.js'

const pingVerbs = {ping: pageVerb(z.object({n: z.number()}), (args) => ({pong: args.n + 1}))}

type PingCaller = PageCaller<typeof pingVerbs>

const checkPing = defineTool<z.ZodObject<{n: z.ZodNumber}>, {page: PingCaller}>({
  name: 'pinger.checkPing',
  description: 'calls the browser ping verb',
  inputSchema: z.object({n: z.number()}),
}).server((input, ctx) => ctx.page.call('ping', {n: input.n}))

const pinger = defineExtension({name: 'pinger', tools: [checkPing]})

describe('extension tool driving server.page.call (loading contract)', () => {
  it('propagates a rejected page-verb call out of the tool execute as a PageVerbError', async () => {
    const context = {page: noWidgetPageCaller<typeof pingVerbs>('pinger')}
    const [tool] = buildExtensionTools(pinger, context)
    if (!tool) throw new Error('expected the pinger tool to build')
    const failure = await tool.execute({n: 1}, {sessionId: 's', model: null}).then(
      () => null,
      (error: unknown) => error,
    )
    expect(isPageVerbError(failure)).toBe(true)
    if (!isPageVerbError(failure)) throw new Error('expected a PageVerbError')
    expect(failure.code).toBe('no-widget')
    expect(failure.verb).toBe('ping')
  })
})
