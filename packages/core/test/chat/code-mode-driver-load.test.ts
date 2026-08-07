import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import {z} from 'zod'
import type {ToolRequest} from '@conciv/extension'
import type {PermissionGate} from '../../src/chat/gate.js'
import type {CodeCapability} from '../../src/chat/capabilities.js'

const request: ToolRequest = {sessionId: 'conciv_x', model: null}

const allowGate: PermissionGate = {decide: async () => 'allow'}

function capability(name: string): CodeCapability {
  const inputSchema = z.object({})
  return {
    name,
    description: `${name} does a thing. Extra prose here.`,
    summary: `${name} does a thing`,
    category: 'extension',
    mutating: false,
    reachable: true,
    errors: [],
    inputSchema,
    execute: async () => 'ok',
    signature: () => ({input: z.toJSONSchema(inputSchema, {io: 'input'}), output: undefined, errors: []}),
  }
}

describe('isolate driver load memoization', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.doUnmock('@tanstack/ai-isolate-node')
  })

  test('two concurrent first uses share exactly one import of the driver module', async () => {
    let importCount = 0
    vi.doMock('@tanstack/ai-isolate-node', () => {
      importCount += 1
      return {
        probeIsolatedVm: () => ({compatible: true}),
        createNodeIsolateDriver: () => ({}),
      }
    })
    const {makeCodeMode} = await import('../../src/chat/code-mode.js')
    const capabilities = [capability('safe_tool')]
    const [first, second] = await Promise.all([
      makeCodeMode(() => capabilities, request, allowGate),
      makeCodeMode(() => capabilities, request, allowGate),
    ])
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(importCount).toBe(1)
  })

  test('a failing driver load rejects the caller and a later call retries instead of staying dead', async () => {
    const state = {attempt: 0}
    vi.doMock('@tanstack/ai-isolate-node', () => ({
      probeIsolatedVm: () => {
        state.attempt += 1
        if (state.attempt === 1) throw new Error('native addon failed to load')
        return {compatible: true}
      },
      createNodeIsolateDriver: () => ({}),
    }))
    const {makeCodeMode} = await import('../../src/chat/code-mode.js')
    const capabilities = [capability('safe_tool')]
    await expect(makeCodeMode(() => capabilities, request, allowGate)).rejects.toThrow('native addon failed to load')
    const retried = await makeCodeMode(() => capabilities, request, allowGate)
    expect(retried).not.toBeNull()
    expect(state.attempt).toBe(2)
  })
})
