import {expect, test} from 'vitest'
import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'
import {composeSystemPrompt} from '../src/start.js'
import {withBuiltinExtensions} from '../src/app.js'

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
  const prompt = composeSystemPrompt('base prompt', [demoExtension], {cwd: '/repo'})
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

const groundedExtension = defineExtension({
  name: 'ios',
  systemPrompt: (config, context) => `project ${config.projectRoot} under ${context.cwd}`,
  configSchema: z.preprocess(emptyToUndefined, z.object({projectRoot: z.string()}).optional()),
})

const transformedExtension = defineExtension({
  name: 'ios',
  systemPrompt: (config) => `simulator ${config.simulator} in ${config.projectRoot}`,
  configSchema: z.preprocess(
    emptyToUndefined,
    z
      .object({projectRoot: z.string(), simulator: z.string().default('iPhone 17 Pro')})
      .transform((config) => ({...config, projectRoot: config.projectRoot.replace(/\/+$/, '')}))
      .optional(),
  ),
})

test('an extension whose config is absent contributes no systemPrompt', () => {
  const prompt = composeSystemPrompt('base prompt', [configuredExtension], {cwd: '/repo', extensions: {}})
  expect(prompt).toBe('base prompt')
  expect(prompt).not.toContain('iOS overlay rules.')
})

test('a configured extension contributes its systemPrompt', () => {
  const prompt = composeSystemPrompt('base prompt', [configuredExtension], {
    cwd: '/repo',
    extensions: {ios: {projectRoot: '/app'}},
  })
  expect(prompt).toContain('iOS overlay rules.')
})

test('a schemaless extension always contributes its systemPrompt', () => {
  const prompt = composeSystemPrompt('base prompt', [demoExtension], {cwd: '/repo', extensions: {}})
  expect(prompt).toContain('Demo extension rules.')
})

test('an extension can ground its prompt in its own config and the working directory', () => {
  const prompt = composeSystemPrompt('base prompt', [groundedExtension], {
    cwd: '/repo',
    extensions: {ios: {projectRoot: '/app'}},
  })
  expect(prompt).toContain('project /app under /repo')
})

test('a prompt factory receives the parsed config, not the raw options', () => {
  const prompt = composeSystemPrompt(undefined, [transformedExtension], {
    cwd: '/repo',
    extensions: {ios: {projectRoot: '/app/'}},
  })
  expect(prompt).toBe('simulator iPhone 17 Pro in /app')
})

test('the built-in page extension steers the standing prompt toward the typed verbs', () => {
  const prompt = composeSystemPrompt('base prompt', withBuiltinExtensions(undefined), {cwd: '/repo'})
  expect(prompt).toContain('page.snapshot')
  expect(prompt).toContain('last resort')
  expect(prompt).toContain('approval on every call')
})

test('a prompt factory never runs for an unconfigured extension', () => {
  const prompt = composeSystemPrompt('base prompt', [groundedExtension], {cwd: '/repo', extensions: {}})
  expect(prompt).toBe('base prompt')
})
