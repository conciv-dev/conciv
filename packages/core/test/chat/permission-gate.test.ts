import {describe, expect, it} from 'vitest'
import type {StreamChunk} from '@tanstack/ai'
import {approvalIds} from '@conciv/harness-testkit'
import {SessionId} from '@conciv/protocol/chat-types'
import {createAskRegistry} from '../../src/chat/ask.js'
import {createCommandMemory} from '../../src/chat/command-memory.js'
import {asksFor, commandMemoryFor, makeRunGate} from '../../src/chat/gate.js'

const SESSION = SessionId.parse('conciv_x')

const fixture = (timeoutMs?: number) => {
  const asks = createAskRegistry()
  const memory = createCommandMemory()
  const emitted: StreamChunk[] = []
  const risky = new Set(['canvas.delete'])
  const gate = makeRunGate({
    asks: asksFor(asks, SESSION),
    memory: commandMemoryFor(memory, SESSION),
    emit: (chunk) => emitted.push(chunk),
    risky,
    timeoutMs: timeoutMs ?? 100,
  })
  const approvalId = (): string | undefined => emitted.flatMap(approvalIds)[0]
  const askedIds = (): string[] => emitted.flatMap(approvalIds)
  return {asks, emitted, approvalId, askedIds, gate, memory}
}

const settledApprovalId = async (approvalId: () => string | undefined): Promise<string> => {
  await new Promise((resolve) => setTimeout(resolve, 60))
  const id = approvalId()
  if (id === undefined) throw new Error('no approval id')
  return id
}

describe('run gate on awaitReply', () => {
  it('allows a safe tool outright (no approval part)', async () => {
    const {gate, emitted} = fixture()
    expect(await gate.decide('Read', {path: '/x'}, 'tu1')).toBe('allow')
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
    expect(await gate.decide(name, {id: 'r1'}, 'tu2')).toBe('timeout')
  })

  it.each(['canvas.read', 'mcp__conciv__canvas.draw', 'mcp__tanstack__canvas.read'])(
    'leaves %s alone: a non-risky tool in every mcp prefix form',
    async (name) => {
      const {gate} = fixture(30)
      expect(await gate.decide(name, {id: 'r1'}, 'tu3')).toBe('allow')
    },
  )

  it('fires an approval request for a bridge-visible risky tool name (does not execute silently)', async () => {
    const {gate, asks, approvalId} = fixture(5_000)
    const pending = gate.decide('mcp__tanstack__canvas.delete', {id: 'r1'}, 'tu3b')
    asks.reply(SESSION, await settledApprovalId(approvalId), false)
    expect(await pending).toBe('deny')
  })

  it('risky tool with no folded part gets a synthetic part, annotated with the approval, and an approve reply allows', async () => {
    const {gate, asks, approvalId} = fixture(5_000)
    const pending = gate.decide('mcp__conciv__canvas.delete', {id: 'r1'}, 'tu4')
    asks.reply(SESSION, await settledApprovalId(approvalId), true)
    expect(await pending).toBe('allow')
  })

  it('a deny reply denies', async () => {
    const {gate, asks, approvalId} = fixture(5_000)
    const pending = gate.decide('Bash', {command: 'rm -rf /tmp/x'}, 'tu5')
    asks.reply(SESSION, await settledApprovalId(approvalId), false)
    expect(await pending).toBe('deny')
  })
})

describe('run gate with a session command memory', () => {
  it('a compound read-only pipeline runs without ever asking', async () => {
    const {gate, emitted} = fixture()
    expect(await gate.decide('Bash', {command: 'cd packages/core && grep -rn needle src | head -20'}, 'tu-a')).toBe(
      'allow',
    )
    expect(emitted).toEqual([])
  })

  it('replays the exact command the user allowed for the session, and asks again for any variant', async () => {
    const {gate, asks, approvalId, askedIds, memory} = fixture(5_000)
    const pending = gate.decide('Bash', {command: 'pnpm run build'}, 'tu-b')
    const id = await settledApprovalId(approvalId)
    memory.remember(SESSION, id)
    asks.reply(SESSION, id, true)
    expect(await pending).toBe('allow')
    expect(askedIds()).toHaveLength(1)

    expect(await gate.decide('Bash', {command: 'pnpm run build'}, 'tu-c')).toBe('allow')
    expect(askedIds()).toHaveLength(1)

    const variant = gate.decide('Bash', {command: 'pnpm run build --force'}, 'tu-d')
    await settledApprovalId(approvalId)
    expect(askedIds()).toHaveLength(2)
    asks.reply(SESSION, askedIds()[1] ?? '', false)
    expect(await variant).toBe('deny')
  })

  it('never remembers a command whose syntax could hide a second command', async () => {
    const {gate, asks, approvalId, askedIds, memory} = fixture(5_000)
    const pending = gate.decide('Bash', {command: 'grep "$(cat target)" src'}, 'tu-e')
    const id = await settledApprovalId(approvalId)
    memory.remember(SESSION, id)
    asks.reply(SESSION, id, true)
    expect(await pending).toBe('allow')

    const again = gate.decide('Bash', {command: 'grep "$(cat target)" src'}, 'tu-f')
    await settledApprovalId(approvalId)
    expect(askedIds()).toHaveLength(2)
    asks.reply(SESSION, askedIds()[1] ?? '', false)
    expect(await again).toBe('deny')
  })

  it('remembers nothing when the user approves only once', async () => {
    const {gate, asks, approvalId, askedIds} = fixture(5_000)
    const pending = gate.decide('Bash', {command: 'pnpm run test'}, 'tu-g')
    asks.reply(SESSION, await settledApprovalId(approvalId), true)
    expect(await pending).toBe('allow')

    const again = gate.decide('Bash', {command: 'pnpm run test'}, 'tu-h')
    await settledApprovalId(approvalId)
    expect(askedIds()).toHaveLength(2)
    asks.reply(SESSION, askedIds()[1] ?? '', false)
    expect(await again).toBe('deny')
  })
})

describe('run gate on the code-mode surface', () => {
  it('lets execute_typescript through: the sandbox gates each capability the code calls', async () => {
    const {gate, emitted} = fixture(5_000)
    const input = {typescriptCode: 'return await external_page_click({selector: ".buy"})'}
    expect(await gate.decide('execute_typescript', input, 'tu-exec')).toBe('allow')
    expect(emitted).toEqual([])
  })
})
