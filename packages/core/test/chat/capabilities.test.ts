import {describe, expect, test} from 'vitest'
import {z} from 'zod'
import type {ExtensionServerTool} from '@conciv/extension'
import {extensionCapabilities} from '../../src/chat/capabilities.js'

function serverTool(description: string): ExtensionServerTool {
  return {
    name: 'acme.draw',
    description,
    inputSchema: z.object({}),
    mutating: false,
    errors: [],
    execute: async () => 'drew',
  }
}

describe('extensionCapabilities summaries', () => {
  test('summary skips leading whitespace before the first sentence', () => {
    const capabilities = extensionCapabilities([serverTool('\nDraws a shape on the canvas. Accepts svg paths.')])
    expect(capabilities[0]?.summary).toBe('Draws a shape on the canvas.')
  })

  test('summary cuts at a newline when no period-space boundary exists', () => {
    const capabilities = extensionCapabilities([serverTool('\n  Draws a shape.\nSecond line.')])
    expect(capabilities[0]?.summary).toBe('Draws a shape.')
  })

  test('declared errors surface in the capability signature', () => {
    const tool = serverTool('Draws a shape.')
    const capabilities = extensionCapabilities([{...tool, errors: [{code: 'NO_CANVAS', message: 'no canvas open'}]}])
    expect(capabilities[0]?.errors).toEqual([{code: 'NO_CANVAS', message: 'no canvas open'}])
    expect(capabilities[0]?.signature().errors).toEqual([{code: 'NO_CANVAS', message: 'no canvas open'}])
  })
})
