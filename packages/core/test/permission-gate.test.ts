import {describe, expect, it} from 'vitest'
import {StreamProcessor} from '@tanstack/ai'
import {writeReply} from '@conciv/db'
import {makeChanges} from '../src/chat/changes.js'
import {makeRunGate} from '../src/chat/sandbox.js'
import {testDb} from './helpers/memory-store.js'

const fixture = (timeoutMs?: number) => {
  const db = testDb()
  const changes = makeChanges()
  const processor = new StreamProcessor({events: {}})
  const risky = new Set(['mcp__conciv__canvas.delete'])
  const gate = makeRunGate({sessionId: 'conciv_x', processor, db, changes, risky, timeoutMs: timeoutMs ?? 100, partWaitMs: 10})
  return {db, changes, processor, gate}
}

describe('run gate on awaitReply', () => {
  it('allows a safe tool outright (no approval part)', async () => {
    const {gate, processor} = fixture()
    expect(await gate.decide('Read', {path: '/x'}, 'conciv_x', 'tu1')).toBe('allow')
    expect(processor.getMessages().flatMap((message) => message.parts)).toEqual([])
  })

  it('does not gate the unprefixed tool name (locks the prefixed-name form)', async () => {
    const {gate} = fixture()
    expect(await gate.decide('canvas.delete', {id: 'r1'}, 'conciv_x', 'tu2')).toBe('allow')
  })

  it('risky tool times out to deny when nobody replies', async () => {
    const {gate} = fixture(30)
    expect(await gate.decide('mcp__conciv__canvas.delete', {id: 'r1'}, 'conciv_x', 'tu3')).toBe('deny')
  })

  it('risky tool with no folded part gets a synthetic part, annotated with the approval, and an approve reply allows', async () => {
    const {gate, db, changes, processor} = fixture(5_000)
    const pending = gate.decide('mcp__conciv__canvas.delete', {id: 'r1'}, 'conciv_x', 'tu4')
    await new Promise((resolve) => setTimeout(resolve, 60))
    const parts = processor.getMessages().flatMap((message) => message.parts)
    const toolPart = parts.find((part) => part.type === 'tool-call')
    expect(toolPart).toBeDefined()
    const approvalId =
      toolPart && 'approval' in toolPart && toolPart.approval ? toolPart.approval.id : undefined
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
    const approvalId =
      toolPart && 'approval' in toolPart && toolPart.approval ? toolPart.approval.id : undefined
    if (approvalId === undefined) throw new Error('no approval id')
    writeReply(db, 'conciv_x', approvalId, false)
    changes.notify()
    expect(await pending).toBe('deny')
  })
})
