import {expect, test} from 'vitest'
import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'
import {buildExtensionTools} from '../../src/app.js'

const demoTool = defineTool({
  name: 'demo_tool',
  description: 'Does a demo thing.',
  inputSchema: z.object({}),
  promptSnippet: 'Use demo_tool before demo_other.',
  promptGuidelines: ['Never call twice.', 'Prefer small inputs.'],
  approval: 'ask',
}).server(async () => ({}))

const extension = defineExtension({name: 'demo', tools: [demoTool]})

test('folds snippet and guidelines into the server tool description and keeps approval', () => {
  const [tool] = buildExtensionTools(extension, {})
  expect(tool?.description).toBe(
    'Does a demo thing.\n\nUse demo_tool before demo_other.\n\nNever call twice.\n\nPrefer small inputs.',
  )
  expect(tool?.approval).toBe('ask')
})
