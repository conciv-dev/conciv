import type {StreamChunk} from '@tanstack/ai'
import {describe, expect, it} from 'vitest'
import {makePermissionGate} from '../src/api/chat/permission.js'
import {makeUiBus} from '../src/runtime/ui-bus.js'

const approvalIdOf = (chunk: StreamChunk): string | undefined => {
  const value = (chunk as {value?: {approval?: {id?: string}}}).value
  return value?.approval?.id
}

describe('permission gate request', () => {
  it('returns false when no channel is open for the session', async () => {
    const gate = makePermissionGate(makeUiBus(), {timeoutMs: 500})
    expect(await gate.request('nobody', {toolName: 'canvas.update', input: {}})).toBe(false)
  })

  it('injects an approval and resolves to the user decision', async () => {
    const uiBus = makeUiBus()
    const sessionId = 's1'
    async function* keepOpen(): AsyncGenerator<StreamChunk> {
      await new Promise<never>(() => {})
    }
    const drain = uiBus.run(sessionId, keepOpen())
    const gate = makePermissionGate(uiBus, {timeoutMs: 2000})
    const decision = gate.request(sessionId, {toolName: 'canvas.update', input: {elementId: 'e'}})
    const first = await drain.next()
    const approvalId = approvalIdOf(first.value as StreamChunk)
    expect(approvalId).toBeDefined()
    if (approvalId) gate.resolve(approvalId, true)
    expect(await decision).toBe(true)
  })
})
