import {expect, test} from 'vitest'
import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'
import {composeSystemPrompt} from '../src/start.js'

const demoTool = defineTool({
  name: 'demo_tool',
  description: 'Does a demo thing.',
  inputSchema: z.object({}),
  promptSnippet: 'NEVER-IN-PROMPT',
  approval: 'ask',
}).server(async () => ({}))

const demoExtension = defineExtension({
  name: 'demo',
  systemPrompt: 'Demo extension rules.',
  tools: [demoTool],
})

test('standing prompt contains extension systemPrompt but never tool prose', () => {
  const prompt = composeSystemPrompt('base prompt', [demoExtension])
  expect(prompt).toContain('base prompt')
  expect(prompt).toContain('Demo extension rules.')
  expect(prompt).not.toContain('NEVER-IN-PROMPT')
})
