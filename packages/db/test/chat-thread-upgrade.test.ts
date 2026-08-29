import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import type {ReconstructedChat} from '@tanstack/ai-persistence'
import {defineAIPersistence, reconstructChat} from '@tanstack/ai-persistence'
import {CODE_MODE_SYNTHETIC_PART_MARKER} from '@conciv/protocol/chat-types'
import {openDb, type ConcivDb} from '../src/db.js'
import {createMessageStore} from '../src/message-store.js'
import {createMetadataStore} from '../src/metadata-store.js'
import {createRunStore} from '../src/run-store.js'
import {
  CHAT_IMPORT_KEY,
  CHAT_MIGRATION_NAMESPACE,
  TRANSCRIPT_NAMESPACE,
  anchorKey,
  pendingFromKey,
} from '../src/chat-thread-import.js'
import {runMessagesFor, sessionHistoryFor} from '../src/run-queries.js'
import {
  FOLDED_WITHOUT_ANCHOR_SESSION_ID,
  LAST_PRE_CHAT_STORE_MIGRATION,
  LEGACY_ANCHOR_NATIVE_ID,
  LEGACY_SESSION_ID,
  PRE_CHAT_STORE_MIGRATION_COUNT,
  seedLegacyDb,
} from './fixtures/legacy-db.js'
import {migrations} from '../src/migrations.gen.js'

function upgradedRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'conciv-legacy-upgrade-'))
  seedLegacyDb(root)
  return root
}

async function hydrate(db: ConcivDb, threadId: string): Promise<ReconstructedChat> {
  const persistence = defineAIPersistence({
    stores: {messages: createMessageStore(db), runs: createRunStore(db)},
  })
  const response = await reconstructChat(persistence, new Request(`http://conciv.test/?threadId=${threadId}`))
  return (await response.json()) as ReconstructedChat
}

const textOf = (message: ReconstructedChat['messages'][number]): string =>
  message.parts
    .filter((part) => part.type === 'text')
    .map((part) => (part.type === 'text' ? part.content : ''))
    .join('')

describe('upgrading a pre-message-store database', () => {
  it('pins the migration the fixture is built from', () => {
    expect(migrations[PRE_CHAT_STORE_MIGRATION_COUNT - 1]?.name).toBe(LAST_PRE_CHAT_STORE_MIGRATION)
  })

  it('hydrates the whole legacy conversation through reconstructChat', async () => {
    const db = openDb(upgradedRoot())
    const chat = await hydrate(db, LEGACY_SESSION_ID)

    expect(chat.messages.filter((message) => message.role === 'user').map(textOf)).toEqual([
      'look at this',
      'run the code',
      'and now the docs',
    ])
    expect(chat.messages.flatMap((message) => message.parts).filter((part) => part.type === 'image')).toEqual([
      {type: 'image', source: {type: 'data', mimeType: 'image/png', value: 'aGk='}},
    ])
    expect(chat.messages.flatMap((message) => message.parts).filter((part) => part.type === 'document')).toEqual([
      {
        type: 'document',
        source: {type: 'data', mimeType: 'application/pdf', value: 'JVBE'},
        metadata: {modelOnly: true},
      },
    ])
    expect(chat.activeRun).toEqual({runId: 'legacy-run-live'})
  })

  it('keeps the synthetic code-mode marker and the tool result across the boundary conversion', async () => {
    const db = openDb(upgradedRoot())
    const chat = await hydrate(db, LEGACY_SESSION_ID)
    const parts = chat.messages.flatMap((message) => message.parts)

    expect(parts.filter((part) => part.type === 'tool-call')).toMatchObject([
      {
        id: 'call-1',
        name: 'conciv_code',
        arguments: '{"source":"return 1 + 1"}',
        metadata: {[CODE_MODE_SYNTHETIC_PART_MARKER]: true},
      },
    ])
    expect(parts.filter((part) => part.type === 'tool-result')).toMatchObject([{toolCallId: 'call-1', content: '2'}])
  })

  it('moves the anchor id into the metadata store, wrapped so "folded, no anchor" survives', async () => {
    const metadata = createMetadataStore(openDb(upgradedRoot()))

    await expect(metadata.get(TRANSCRIPT_NAMESPACE, anchorKey(LEGACY_SESSION_ID))).resolves.toEqual({
      nativeId: LEGACY_ANCHOR_NATIVE_ID,
    })
    await expect(metadata.get(TRANSCRIPT_NAMESPACE, anchorKey(FOLDED_WITHOUT_ANCHOR_SESSION_ID))).resolves.toEqual({
      nativeId: null,
    })
    await expect(metadata.get(TRANSCRIPT_NAMESPACE, anchorKey('s-never-folded'))).resolves.toBeNull()
  })

  it('records where the still-pending turn starts in the imported thread', async () => {
    const db = openDb(upgradedRoot())
    const metadata = createMetadataStore(db)
    const thread = await createMessageStore(db).loadThread(LEGACY_SESSION_ID)
    const pendingFrom = await metadata.get(TRANSCRIPT_NAMESPACE, pendingFromKey(LEGACY_SESSION_ID))

    expect(pendingFrom).toEqual({index: thread.length - 1})
  })

  it('imports once: reopening the database neither duplicates nor restamps', async () => {
    const root = upgradedRoot()
    const first = openDb(root)
    const importedAt = await createMetadataStore(first).get(CHAT_MIGRATION_NAMESPACE, CHAT_IMPORT_KEY)
    const thread = await createMessageStore(first).loadThread(LEGACY_SESSION_ID)

    const second = openDb(root)
    await expect(createMessageStore(second).loadThread(LEGACY_SESSION_ID)).resolves.toEqual(thread)
    await expect(createMetadataStore(second).get(CHAT_MIGRATION_NAMESPACE, CHAT_IMPORT_KEY)).resolves.toEqual(
      importedAt,
    )
  })

  it('leaves the legacy rows in place so a downgrade still reads them', () => {
    const db = openDb(upgradedRoot())

    expect(sessionHistoryFor(db, LEGACY_SESSION_ID)?.messages).toHaveLength(4)
    expect(runMessagesFor(db, LEGACY_SESSION_ID)?.messages).toHaveLength(1)
  })
})
