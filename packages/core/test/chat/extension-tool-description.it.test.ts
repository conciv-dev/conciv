import {expect, test} from 'vitest'
import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'
import {makeRunTypescript} from '@conciv/harness-testkit'
import {bootKit} from '../helpers/boot.js'

const demoTool = defineTool({
  name: 'demo_tool',
  description: 'Does a demo thing.',
  inputSchema: z.object({}),
  outputSchema: z.object({done: z.boolean()}),
  promptSnippet: 'Use this tool before the other one.',
  promptGuidelines: ['Never call twice.', 'Prefer small inputs.'],
  approval: 'ask',
  meta: {summary: 'do a demo thing', category: 'demo', mutating: true},
}).server(async () => ({done: true}))

const extension = defineExtension({name: 'demo', tools: [demoTool]})

const CatalogList = z.object({
  tools: z.array(z.object({name: z.string(), approval: z.literal('ask').optional()}).loose()),
})

test('folds snippet and guidelines into the served tool description and keeps the declared approval', async () => {
  const kit = await bootKit({extensions: [extension]})
  try {
    const payload = await kit.rpc.meta.tools(undefined)
    const served = payload.tools.find((tool) => tool.name === 'demo_tool')
    expect(served?.description).toBe(
      'Does a demo thing.\n\nUse this tool before the other one.\n\nNever call twice.\n\nPrefer small inputs.',
    )
    const session = await kit.session()
    const listed = CatalogList.parse(
      await makeRunTypescript(kit.base, session)("return await external_catalog({search: 'demo_tool'})"),
    )
    expect(listed.tools.find((tool) => tool.name === 'demo_tool')?.approval).toBe('ask')
  } finally {
    await kit.cleanup()
  }
}, 30_000)
