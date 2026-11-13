import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it, onTestFinished} from 'vitest'
import {toolApprovalId} from '@conciv/ai/server'
import {fakeText} from '@conciv/ai/testkit'
import {openDb} from '@conciv/db'
import {defineHarness} from '@conciv/harness'
import {approvalAskOf, approvalRequestedEvent} from '@conciv/protocol/chat-event-types'
import {SessionId} from '@conciv/protocol/chat-types'
import {createChatPlane} from '../src/index.js'

const model = fakeText()
const answer = model.chatStream.bind(model)
const asking = Object.assign(model, {
  chatStream: async function* (options: Parameters<typeof answer>[0]) {
    yield {
      ...approvalRequestedEvent.create({approvalId: 'per_turn', title: 'turn ask', permission: {always: false}}),
      timestamp: Date.now(),
    }
    yield* answer(options)
  },
})

const harness = defineHarness({
  id: 'fake',
  binName: 'true',
  chatConfig: () => ({adapter: asking}),
  capabilities: {
    resume: false,
    permissionGate: 'none',
    compaction: false,
    systemPrompt: 'file',
    mcp: 'none',
    imageInput: false,
    init: 'none',
    slashCommands: 'none',
    transcriptHistory: false,
  },
})

function openDatabase() {
  const root = mkdtempSync(join(tmpdir(), 'conciv-chat-unit-'))
  const db = openDb(root)
  onTestFinished(() => {
    db.$client.close()
    rmSync(root, {recursive: true, force: true})
  })
  return {root, db}
}

describe('permission cards', () => {
  it('a permission card is stored, replayed with its member, kept in order under overlapping writes, and removed without a grant', async () => {
    const {root, db} = openDatabase()
    const sessionId = SessionId.parse('conciv_cards')
    const plane = await createChatPlane({
      db,
      hubAccess: 'session',
      hubGeneration: () => 0,
      cwd: root,
      harnessFor: () => harness,
      systemPrompt: {},
      sessions: {
        row: () => ({model: null, effort: null, nativeId: null, cwd: '/workspace', harnessKind: 'fake'}),
        ensure: async () => undefined,
        recordNativeId: async () => undefined,
        recordUsage: async () => undefined,
        recordContextTokens: async () => undefined,
        recordActivity: () => {},
        onRunStart: async () => undefined,
        publish: () => undefined,
        onRunEnd: async () => undefined,
      },
      toolNames: new Set(),
      capabilities: () => [],
      attachmentExpanders: {},
      log: () => undefined,
    })
    const editId = toolApprovalId('edit')
    const pendingIds = async () => (await plane.hydrate(sessionId)).pendingApprovals.map((entry) => entry.approvalId)
    const permissionCard = (approvalId: string, always: boolean) => ({
      approvalId,
      toolCallId: approvalId,
      title: `ask ${approvalId}`,
      input: {approvalId},
      permission: {always},
    })

    await plane.permissionAsked(sessionId, {...permissionCard(editId, true), title: 'edit src/a.ts'})
    expect((await plane.hydrate(sessionId)).pendingApprovals).toEqual([
      {
        approvalId: editId,
        toolCallId: editId,
        toolName: 'edit src/a.ts',
        input: {approvalId: editId},
        runId: null,
        permission: {always: true},
      },
    ])
    expect((await plane.catchUp(sessionId)).map(approvalAskOf)).toEqual([
      {
        approvalId: editId,
        toolCallId: editId,
        toolName: 'edit src/a.ts',
        input: {approvalId: editId},
        permission: {always: true},
      },
    ])

    await Promise.all([
      plane.permissionAsked(sessionId, permissionCard('per_2', false)),
      plane.permissionAsked(sessionId, permissionCard('per_3', true)),
      plane.permissionSettled(sessionId, editId),
    ])
    expect(await pendingIds()).toEqual(['per_2', 'per_3'])

    await plane.permissionSettled(sessionId, 'per_2')
    expect(await pendingIds()).toEqual(['per_3'])
    const published: unknown[] = []
    expect(
      await plane.admitCall(sessionId, {
        toolName: 'edit',
        input: {},
        publish: (chunk) => published.push(chunk),
        until: AbortSignal.abort(),
      }),
    ).toMatchObject({reason: 'asked'})

    model.setResponses([{text: 'done'}])
    await plane.followUp(sessionId, 'go on')
    expect(
      (await plane.hydrate(sessionId)).pendingApprovals.find((entry) => entry.approvalId === 'per_turn'),
    ).toMatchObject({
      toolName: 'turn ask',
      permission: {always: false},
    })
  })
})
