import {describe, expect, it} from 'vitest'
import type {StreamChunk} from '@tanstack/ai'
import {approvalIds} from '@conciv/harness-testkit'
import {createAskRegistry} from '../../src/chat/ask.js'
import {makeRunGate} from '../../src/chat/gate.js'

const fixture = (timeoutMs?: number) => {
  const asks = createAskRegistry()
  const emitted: StreamChunk[] = []
  const risky = new Set(['canvas.delete'])
  const gate = makeRunGate({
    sessionId: 'conciv_x',
    asks,
    emit: (chunk) => emitted.push(chunk),
    risky,
    timeoutMs: timeoutMs ?? 100,
  })
  const approvalId = (): string | undefined => emitted.flatMap(approvalIds)[0]
  return {asks, emitted, approvalId, gate}
}

describe('run gate on awaitReply', () => {
  it('allows a safe tool outright (no approval part)', async () => {
    const {gate, emitted} = fixture()
    expect(await gate.decide('Read', {path: '/x'}, 'conciv_x', 'tu1')).toBe('allow')
    expect(emitted).toEqual([])
  })

  it.each([
    'canvas.delete',
    'mcp__conciv__canvas.delete',
    'mcp__tanstack__canvas.delete',
    'mcp__plugin_conciv-connect_conciv__canvas.delete',
    'mcp__conciv__canvas_delete',
  ])('gates %s: every caller path names the same risky tool', async (name) => {
    const {gate} = fixture(30)
    expect(await gate.decide(name, {id: 'r1'}, 'conciv_x', 'tu2')).toBe('deny')
  })

  it.each(['canvas.read', 'mcp__conciv__canvas.draw', 'mcp__tanstack__canvas.read'])(
    'leaves %s alone: a non-risky tool in every mcp prefix form',
    async (name) => {
      const {gate} = fixture(30)
      expect(await gate.decide(name, {id: 'r1'}, 'conciv_x', 'tu3')).toBe('allow')
    },
  )

  it('fires an approval request for a bridge-visible risky tool name (does not execute silently)', async () => {
    const {gate, asks, approvalId} = fixture(5_000)
    const pending = gate.decide('mcp__tanstack__canvas.delete', {id: 'r1'}, 'conciv_x', 'tu3b')
    await new Promise((resolve) => setTimeout(resolve, 60))
    const id = approvalId()
    expect(id).toBeDefined()
    if (id === undefined) throw new Error('no approval id')
    asks.reply('conciv_x', id, false)
    expect(await pending).toBe('deny')
  })

  it('risky tool with no folded part gets a synthetic part, annotated with the approval, and an approve reply allows', async () => {
    const {gate, asks, approvalId} = fixture(5_000)
    const pending = gate.decide('mcp__conciv__canvas.delete', {id: 'r1'}, 'conciv_x', 'tu4')
    await new Promise((resolve) => setTimeout(resolve, 60))
    const id = approvalId()
    expect(id).toBeDefined()
    if (id === undefined) throw new Error('no approval id')
    asks.reply('conciv_x', id, true)
    expect(await pending).toBe('allow')
  })

  it('a deny reply denies', async () => {
    const {gate, asks, approvalId} = fixture(5_000)
    const pending = gate.decide('Bash', {command: 'rm -rf /tmp/x'}, 'conciv_x', 'tu5')
    await new Promise((resolve) => setTimeout(resolve, 60))
    const id = approvalId()
    if (id === undefined) throw new Error('no approval id')
    asks.reply('conciv_x', id, false)
    expect(await pending).toBe('deny')
  })
})
