import {z} from 'zod'
import {defineExtension, defineTool, toolError} from '@conciv/extension'

const spikeText = defineTool({
  name: 'pagespike.text',
  description:
    'spike copy of page.text: reads the text content of a selector-matched element over the client-tool dispatcher',
  inputSchema: z.object({selector: z.string()}),
  outputSchema: z.object({text: z.string()}),
  meta: {summary: 'read text from the live page over the spike dispatcher', category: 'read'},
}).client((input, ctx) => ({
  text: (ctx.target({selector: input.selector}).textContent ?? '').slice(0, 4000),
}))

const spikeClick = defineTool({
  name: 'pagespike.click',
  description: 'spike copy of page.click: clicks an element on the live page over the client-tool dispatcher',
  inputSchema: z.object({selector: z.string().optional(), ref: z.string().optional()}),
  outputSchema: z.object({clicked: z.boolean()}),
  errors: {NOT_CLICKABLE: {message: 'the target is not an HTMLElement'}},
  meta: {
    summary: 'click an element on the live page over the spike dispatcher',
    category: 'act',
    mutating: true,
    mirrors: true,
  },
}).client((input, ctx) => {
  const el = ctx.target(input)
  if (!(el instanceof HTMLElement)) throw toolError('NOT_CLICKABLE')
  el.click()
  return {clicked: true}
})

const spikeAttr = defineTool({
  name: 'pagespike.attr',
  description:
    'spike copy of page.attr: reads an attribute off a snapshot-referenced element over the client-tool dispatcher',
  inputSchema: z.object({ref: z.string(), attribute: z.string()}),
  outputSchema: z.object({value: z.string()}),
  errors: {NO_ATTRIBUTE: {message: 'the element does not carry that attribute'}},
  meta: {summary: 'read an attribute off a snapshot ref over the spike dispatcher', category: 'read'},
}).client((input, ctx) => {
  const value = ctx.target({ref: input.ref}).getAttribute(input.attribute)
  if (value === null) throw toolError('NO_ATTRIBUTE', {message: `no attribute "${input.attribute}" on ${input.ref}`})
  return {value}
})

export const pageSpike = defineExtension({
  name: 'page-spike',
  tools: [spikeText, spikeClick, spikeAttr],
}).client(() => ({value: {}}))
