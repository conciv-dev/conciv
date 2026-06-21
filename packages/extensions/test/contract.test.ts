import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {defineTool, defineEffect} from '../src/contract.js'

describe('defineTool', () => {
  it('is an identity that preserves the definition and infers params', () => {
    const t = defineTool({
      name: 'demo',
      label: 'Demo',
      description: 'd',
      parameters: z.object({x: z.number()}),
      execute: (input) => input.x + 1,
    })
    expect(t.name).toBe('demo')
    expect(t.execute?.({x: 1})).toBe(2)
  })

  it('allows a render-only definition with no execute', () => {
    const t = defineTool({name: 'Bash', label: 'Bash', description: 'd', parameters: z.object({})})
    expect(t.execute).toBeUndefined()
  })

  it('carries names for foreign harness tools that one card serves', () => {
    const t = defineTool({
      name: 'Edit',
      names: ['Edit', 'MultiEdit', 'Write'],
      label: 'Edit',
      description: 'd',
      parameters: z.object({}),
    })
    expect(t.names).toEqual(['Edit', 'MultiEdit', 'Write'])
  })
})

describe('defineEffect', () => {
  it('is an identity helper carrying the effect metadata', () => {
    const e = defineEffect({name: 'highlight', label: 'Highlight', description: 'd', render: () => null})
    expect(e.name).toBe('highlight')
    expect(e.label).toBe('Highlight')
  })
})
