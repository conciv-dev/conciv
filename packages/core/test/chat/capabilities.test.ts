import {describe, expect, test} from 'vitest'
import {z} from 'zod'
import type {ConcivServerTool} from '@conciv/tools'
import {assistCapabilities} from '../../src/chat/capabilities.js'

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
})
