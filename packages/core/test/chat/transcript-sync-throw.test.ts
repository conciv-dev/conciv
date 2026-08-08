import {describe, it, expect, afterEach} from 'vitest'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {defineHarness, type HarnessAdapter} from '@conciv/protocol/harness-types'
import {makeTextAdapter} from '@conciv/harness'
import {openDb, runMessagesFor, sessionHistoryFor, setRunMessages} from '@conciv/db'
import {recoverInterruptedRuns} from '../../src/chat/transcript.js'
import {createRow} from '../../src/chat/session-rows.js'

function harnessThrowingSynchronously(): HarnessAdapter {
  return defineHarness({
    id: 'sync-throw-harness',
    binName: 'true',
    chatConfig: () => ({adapter: makeTextAdapter('sync-throw-harness', async function* () {})}),
    capabilities: {
      resume: false,
      permissionGate: 'none',
      transcriptHistory: true,
      compaction: false,
      systemPrompt: 'none',
      mcp: 'none',
      imageInput: false,
      slashCommands: 'none',
      init: 'none',
    },
    history: {
      messages() {
        throw new Error('transcript file is corrupt')
      },
      observe() {
        throw new Error('not exercised by this test')
      },
      list: () => Promise.resolve([]),
    },
  })
}

describe('recoverInterruptedRuns survives a synchronous throw from history.messages', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true})
  })

  it('folds the pending run into history instead of rejecting the recovery pass', async () => {
    const root = mkdtempSync(join(tmpdir(), 'conciv-sync-throw-'))
    roots.push(root)
    const db = openDb(root)
    const sessionId = 'conciv_sync_throw'
    await createRow(db, {
      id: sessionId,
      harnessSessionId: 'native-sync-throw',
      harnessKind: 'sync-throw-harness',
      origin: 'chat',
      title: null,
      model: null,
      usage: null,
      cwd: root,
      deletedAt: null,
    })
    setRunMessages(db, sessionId, [{id: 'u1', role: 'user', parts: [{type: 'text', content: 'turn in flight'}]}])

    await expect(
      recoverInterruptedRuns({db, harness: harnessThrowingSynchronously(), claudeHome: root}),
    ).resolves.toBeUndefined()

    expect(runMessagesFor(db, sessionId)).toBeNull()
    expect(sessionHistoryFor(db, sessionId)?.messages).toEqual([
      {id: 'u1', role: 'user', parts: [{type: 'text', content: 'turn in flight'}]},
    ])
  })
})
