import {describe, expect, test} from 'vitest'
import {z} from 'zod'
import {StreamProcessor} from '@tanstack/ai'
import {writeReply} from '@conciv/db'
import type {ExtensionServerTool, ToolRequest} from '@conciv/extension'
import {makeChanges} from '../../src/chat/attach.js'
import {makeRunGate} from '../../src/chat/gate.js'
import {gatedToolRun, makeCodeMode} from '../../src/chat/code-mode.js'
import {testDb} from '../helpers/memory-store.js'

const request: ToolRequest = {sessionId: 'conciv_x', model: null}

const allowGate = {decide: async () => 'allow' as const}

const tool = (
  name: string,
  approval?: 'ask',
  execute: ExtensionServerTool['execute'] = async () => 'ok',
): ExtensionServerTool => ({
  name,
  description: `${name} does a thing. Extra prose here.`,
  inputSchema: z.object({}),
  approval,
  execute,
})

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

describe('makeCodeMode', () => {
  test('returns null for an empty tool list', () => {
    expect(makeCodeMode([], request, allowGate)).toBeNull()
  })

  test('binds every extension tool including approval-gated ones behind a discovery companion', () => {
    const result = makeCodeMode([tool('safe_tool'), tool('risky_tool', 'ask')], request, allowGate)
    expect(result).not.toBeNull()
    if (!result) throw new Error('no code mode')
    expect(result.tools.map((entry) => entry.name)).toEqual(['execute_typescript', 'discover_tools'])
    expect(result.systemPrompt).toContain('external_safe_tool')
    expect(result.systemPrompt).toContain('external_risky_tool')
    expect(result.systemPrompt).toContain('discover_tools')
  })
})

describe('gatedToolRun', () => {
  test('deny reply blocks execute and throws a refusal', async () => {
    const db = testDb()
    const changes = makeChanges()
    const processor = new StreamProcessor({events: {}})
    const gate = makeRunGate({
      sessionId: 'conciv_x',
      processor,
      db,
      changes,
      risky: new Set(['canvas.delete']),
      timeoutMs: 30,
      partWaitMs: 10,
    })
    const ran = {value: false}
    const gated = tool('canvas.delete', 'ask', async () => {
      ran.value = true
      return 'deleted'
    })
    const run = gatedToolRun(gated, request, gate)
    await expect(run({})).rejects.toThrow(/denied/i)
    expect(ran.value).toBe(false)
  })

  test('allow reply lets execute run and returns its result', async () => {
    const db = testDb()
    const changes = makeChanges()
    const processor = new StreamProcessor({events: {}})
    const gate = makeRunGate({
      sessionId: 'conciv_x',
      processor,
      db,
      changes,
      risky: new Set(['canvas.delete']),
      timeoutMs: 5_000,
      partWaitMs: 10,
    })
    const ran = {value: false}
    const gated = tool('canvas.delete', 'ask', async () => {
      ran.value = true
      return 'deleted'
    })
    const run = gatedToolRun(gated, request, gate)
    const pending = run({})
    await sleep(60)
    const parts = processor.getMessages().flatMap((message) => message.parts)
    const toolPart = parts.find((part) => part.type === 'tool-call')
    const approvalId = toolPart && 'approval' in toolPart && toolPart.approval ? toolPart.approval.id : undefined
    if (approvalId === undefined) throw new Error('no approval id')
    writeReply(db, 'conciv_x', approvalId, true)
    changes.notify()
    await expect(pending).resolves.toBe('deleted')
    expect(ran.value).toBe(true)
  })
})
