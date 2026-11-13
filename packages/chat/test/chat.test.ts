import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it, onTestFinished} from 'vitest'
import {drizzleChatStores} from '@conciv/ai/server'
import {fakeText} from '@conciv/ai/testkit'
import {openDb} from '@conciv/db'
import {defineHarness} from '@conciv/harness'
import {approvalAskOf} from '@conciv/protocol/chat-event-types'
import {SessionId} from '@conciv/protocol/chat-types'
import {createApprovalStore} from '../src/approvals.js'
import {createChatPlane} from '../src/index.js'
import {metadataKeysEndingWith} from '../src/stores.js'

const harness = defineHarness({
  id: 'fake',
  binName: 'true',
  chatConfig: () => ({adapter: fakeText()}),
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
  it('a permission card is stored, replayed with its member, removed without a grant, and swept by test', async () => {
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
    const stores = drizzleChatStores(db, {harnessOf: () => 'fake', saved: () => undefined})
    const approvals = createApprovalStore(
      {...stores.metadata, keysEndingWith: (namespace, suffix) => metadataKeysEndingWith(db, namespace, suffix)},
      'session',
      () => 0,
    )

    await plane.permissionAsked(sessionId, {
      approvalId: 'per_1',
      toolCallId: 'per_1',
      title: 'edit src/a.ts',
      input: {filepath: 'src/a.ts'},
      permission: {always: true},
    })
    const card = {
      approvalId: 'per_1',
      toolCallId: 'per_1',
      toolName: 'edit src/a.ts',
      input: {filepath: 'src/a.ts'},
      runId: null,
      permission: {always: true},
    }
    expect((await plane.hydrate(sessionId)).pendingApprovals).toEqual([card])
    expect((await plane.catchUp(sessionId)).map(approvalAskOf)).toEqual([
      {
        approvalId: 'per_1',
        toolCallId: 'per_1',
        toolName: 'edit src/a.ts',
        input: {filepath: 'src/a.ts'},
        permission: {always: true},
      },
    ])

    await plane.permissionSettled(sessionId, 'per_1')
    expect((await plane.hydrate(sessionId)).pendingApprovals).toEqual([])
    expect(await approvals.admit(sessionId, 'per_1')).toBe('ask')

    const plain = {approvalId: 'tool:a', toolCallId: 'tool:a', title: 'a', input: {}, runId: null}
    await approvals.asked(sessionId, plain)
    await approvals.asked(sessionId, {...plain, approvalId: 'per_2', toolCallId: 'per_2', permission: {always: false}})
    await approvals.remove(sessionId, 'tool:a')
    expect(await approvals.admit(sessionId, 'tool:a')).toBe('ask')
    await approvals.asked(sessionId, plain)
    await approvals.removeWhere(sessionId, (entry) => entry.permission !== undefined)
    expect((await approvals.pending(sessionId)).map((entry) => entry.approvalId)).toEqual(['tool:a'])
  })
})
