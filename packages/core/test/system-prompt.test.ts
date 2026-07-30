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

function emptyToUndefined(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).length === 0) return undefined
  return raw
}

const configuredExtension = defineExtension({
  name: 'ios',
  systemPrompt: 'iOS overlay rules.',
  configSchema: z.preprocess(emptyToUndefined, z.object({projectRoot: z.string()}).optional()),
})

test('an extension whose config is absent contributes no systemPrompt', () => {
  const prompt = composeSystemPrompt('base prompt', [configuredExtension], {})
  expect(prompt).toBe('base prompt')
  expect(prompt).not.toContain('iOS overlay rules.')
})

test('a configured extension contributes its systemPrompt', () => {
  const prompt = composeSystemPrompt('base prompt', [configuredExtension], {ios: {projectRoot: '/app'}})
  expect(prompt).toContain('iOS overlay rules.')
})

test('a schemaless extension always contributes its systemPrompt', () => {
  const prompt = composeSystemPrompt('base prompt', [demoExtension], {})
  expect(prompt).toContain('Demo extension rules.')
})
