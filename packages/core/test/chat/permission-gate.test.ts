import {describe, expect, it} from 'vitest'
import {StreamProcessor} from '@tanstack/ai'
import {writeReply} from '@conciv/db'
import {makeChanges} from '../../src/chat/attach.js'
import {makeRunGate} from '../../src/chat/gate.js'
import {testDb} from '../helpers/memory-store.js'

const fixture = (timeoutMs?: number) => {
  const db = testDb()
  const changes = makeChanges()
  const processor = new StreamProcessor({events: {}})
  const risky = new Set(['canvas.delete'])
  const gate = makeRunGate({
    sessionId: 'conciv_x',
    processor,
    db,
    changes,
    risky,
    timeoutMs: timeoutMs ?? 100,
    partWaitMs: 10,
  })
  return {db, changes, processor, gate}
}

describe('run gate on awaitReply', () => {
  it('allows a safe tool outright (no approval part)', async () => {
    const {gate, processor} = fixture()
    expect(await gate.decide('Read', {path: '/x'}, 'conciv_x', 'tu1')).toBe('allow')
    expect(processor.getMessages().flatMap((message) => message.parts)).toEqual([])
  })

  it('gates a risky tool by bare name across every mcp prefix', async () => {
    const bare = fixture(30)
    expect(await bare.gate.decide('canvas.delete', {id: 'r1'}, 'conciv_x', 'tu2a')).toBe('deny')
    const conciv = fixture(30)
    expect(await conciv.gate.decide('mcp__conciv__canvas.delete', {id: 'r1'}, 'conciv_x', 'tu2b')).toBe('deny')
    const tanstack = fixture(30)
    expect(await tanstack.gate.decide('mcp__tanstack__canvas.delete', {id: 'r1'}, 'conciv_x', 'tu2c')).toBe('deny')
  })

  it('allows a non-risky tool in every mcp prefix form', async () => {
    const bare = fixture()
    expect(await bare.gate.decide('canvas.read', {id: 'r1'}, 'conciv_x', 'tu2d')).toBe('allow')
    const conciv = fixture()
    expect(await conciv.gate.decide('mcp__conciv__canvas.read', {id: 'r1'}, 'conciv_x', 'tu2e')).toBe('allow')
    const tanstack = fixture()
    expect(await tanstack.gate.decide('mcp__tanstack__canvas.read', {id: 'r1'}, 'conciv_x', 'tu2f')).toBe('allow')
  })

  it('risky tool times out to deny when nobody replies', async () => {
    const {gate} = fixture(30)
    expect(await gate.decide('mcp__conciv__canvas.delete', {id: 'r1'}, 'conciv_x', 'tu3')).toBe('deny')
  })

  it('fires an approval request for a bridge-visible risky tool name (does not execute silently)', async () => {
    const {gate, db, changes, processor} = fixture(5_000)
    const pending = gate.decide('mcp__tanstack__canvas.delete', {id: 'r1'}, 'conciv_x', 'tu3b')
    await new Promise((resolve) => setTimeout(resolve, 60))
    const parts = processor.getMessages().flatMap((message) => message.parts)
    const toolPart = parts.find((part) => part.type === 'tool-call')
    expect(toolPart).toBeDefined()
    const approvalId = toolPart && 'approval' in toolPart && toolPart.approval ? toolPart.approval.id : undefined
    expect(approvalId).toBeDefined()
    if (approvalId === undefined) throw new Error('no approval id')
    writeReply(db, 'conciv_x', approvalId, false)
    changes.notify()
    expect(await pending).toBe('deny')
  })

  it('risky tool with no folded part gets a synthetic part, annotated with the approval, and an approve reply allows', async () => {
    const {gate, db, changes, processor} = fixture(5_000)
    const pending = gate.decide('mcp__conciv__canvas.delete', {id: 'r1'}, 'conciv_x', 'tu4')
    await new Promise((resolve) => setTimeout(resolve, 60))
    const parts = processor.getMessages().flatMap((message) => message.parts)
    const toolPart = parts.find((part) => part.type === 'tool-call')
    expect(toolPart).toBeDefined()
    const approvalId = toolPart && 'approval' in toolPart && toolPart.approval ? toolPart.approval.id : undefined
    expect(approvalId).toBeDefined()
    if (approvalId === undefined) throw new Error('no approval id')
    writeReply(db, 'conciv_x', approvalId, true)
    changes.notify()
    expect(await pending).toBe('allow')
  })

  it('a deny reply denies', async () => {
    const {gate, db, changes, processor} = fixture(5_000)
    const pending = gate.decide('Bash', {command: 'rm -rf /tmp/x'}, 'conciv_x', 'tu5')
    await new Promise((resolve) => setTimeout(resolve, 60))
    const parts = processor.getMessages().flatMap((message) => message.parts)
    const toolPart = parts.find((part) => part.type === 'tool-call')
    const approvalId = toolPart && 'approval' in toolPart && toolPart.approval ? toolPart.approval.id : undefined
    if (approvalId === undefined) throw new Error('no approval id')
    writeReply(db, 'conciv_x', approvalId, false)
    changes.notify()
    expect(await pending).toBe('deny')
  })
})
