import {describe, expect, test} from 'vitest'
import {z} from 'zod'
import type {ConcivServerTool} from '@conciv/tools'
import {defineTool} from '@conciv/extension'
import {createToolRegistry} from '@conciv/extension/registry'
import {assistCapabilities, registryCapabilities} from '../../src/chat/capabilities.js'

function assistTool(description: string): ConcivServerTool {
  return {
    name: 'conciv_draw',
    description,
    inputSchema: z.object({}),
    execute: async () => 'drew',
  }
}

describe('assistCapabilities summaries', () => {
  test('summary skips leading whitespace before the first sentence', () => {
    const capabilities = assistCapabilities([assistTool('\nDraws a shape on the canvas. Accepts svg paths.')])
    expect(capabilities[0]?.summary).toBe('Draws a shape on the canvas.')
  })

  test('summary cuts at a newline when no period-space boundary exists', () => {
    const capabilities = assistCapabilities([assistTool('\n  Draws a shape.\nSecond line.')])
    expect(capabilities[0]?.summary).toBe('Draws a shape.')
  })

  test('an assist tool declares no keywords rather than dropping the field', () => {
    expect(assistCapabilities([assistTool('Draws a shape.')])[0]?.keywords).toEqual([])
  })
})

const keyworded = defineTool({
  name: 'probe.controls',
  description: 'read every control with its current value',
  inputSchema: z.object({}),
  outputSchema: z.object({}),
  meta: {
    summary: 'read every control with its current value',
    category: 'read',
    hint: 'the one-shot form read',
    keywords: ['form', 'fields'],
  },
}).client()

function probeCapabilities() {
  const registry = createToolRegistry({pageCaller: async () => ({ok: true}), isAnyPageConnected: () => true})
  registry.register(keyworded, {owner: 'a test registrant'})
  return registryCapabilities(registry.sandboxTools(), async () => undefined)
}

describe('registryCapabilities', () => {
  test('carries the hand-curated keywords of a declaration into its capability', () => {
    expect(probeCapabilities()[0]?.keywords).toEqual(['form', 'fields'])
  })

  test('still folds the hint into the description', () => {
    expect(probeCapabilities()[0]?.description).toBe(
      'read every control with its current value. the one-shot form read',
    )
  })
})
