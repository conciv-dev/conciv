import {mkdtempSync, readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it, expectTypeOf} from 'vitest'
import type {ElementCapture, ElementCaptureKind} from '@conciv/protocol/element-capture-types'
import {deleteSessionCaptures, sessionCaptures, writeToolCapture} from '../src/capture-queries.js'
import {openDb, type ConcivDb} from '../src/db.js'
import {defineAIPersistence, reconstructChat} from '@tanstack/ai-persistence'
import type {ReconstructedChat} from '@tanstack/ai-persistence'
import {runPersistenceConformance} from '@tanstack/ai-persistence/testkit'
import {createMessageStore} from '../src/message-store.js'
import {createMetadataStore} from '../src/metadata-store.js'
import {createRunStore} from '../src/run-store.js'
import {CODE_MODE_SYNTHETIC_PART_MARKER} from '@conciv/protocol/chat-types'
import type {SessionRecord} from '@conciv/protocol/chat-types'
import {
  CHAT_IMPORT_KEY,
  CHAT_MIGRATION_NAMESPACE,
  TRANSCRIPT_NAMESPACE,
  anchorKey,
  pendingFromKey,
} from '../src/chat-thread-import.js'
import {runMessagesFor, sessionHistoryFor, clearRunState, modelOf} from '../src/run-queries.js'
import {
  FOLDED_WITHOUT_ANCHOR_SESSION_ID,
  LAST_PRE_CHAT_STORE_MIGRATION,
  LEGACY_ANCHOR_NATIVE_ID,
  LEGACY_SESSION_ID,
  PRE_CHAT_STORE_MIGRATION_COUNT,
  seedLegacyDb,
} from './fixtures/legacy-db.js'
import {migrations} from '../src/migrations.gen.js'
import {DatabaseSync} from 'node:sqlite'
import {fileURLToPath} from 'node:url'
import {eq} from 'drizzle-orm'
import {runMessages, sessionHistory, runs} from '../src/run-schema.js'
import {sessions} from '../src/schema.js'
import {readThread, updateThread, deleteThread, pendingThreadIds, threadMessages} from '../src/thread-queries.js'

describe('capture queries', () => {
  function side(kind: ElementCaptureKind, name: string, cssBundleId = 'cssabc'): ElementCapture {
    return {
      kind,
      ts: 7,
      descriptor: {tagName: 'input', selectorPath: `#${name}`, role: 'textbox', value: '***'},
      node: {type: 2, tagName: 'input', attributes: {'data-rr-target': 'true'}, childNodes: [], id: 3},
      cssBundleId,
    }
  }

  function unserializableSide(kind: ElementCaptureKind, name: string): ElementCapture {
    return {
      kind,
      ts: 7,
      descriptor: {tagName: 'input', selectorPath: `#${name}`, role: 'textbox', value: '***'},
      node: 10n,
    }
  }

  function freshRoot(): string {
    return mkdtempSync(join(tmpdir(), 'conciv-captures-'))
  }

  describe('tool captures outlive the run that produced them', () => {
    it('keeps both sides of one tool call and hands them back after the database is reopened', async () => {
      const root = freshRoot()
      await writeToolCapture(openDb(root), {
        sessionId: 's1',
        toolCallId: 'call-1',
        bundle: {
          before: side('before', 'email'),
          after: side('after', 'email'),
          cssBundles: [{hash: 'cssabc', css: 'i{}'}],
        },
      })

      const reopened = await sessionCaptures(openDb(root), 's1')
      expect(reopened.captures.map((row) => row.kind).toSorted()).toEqual(['after', 'before'])
      expect(new Set(reopened.captures.map((row) => row.toolCallId))).toEqual(new Set(['call-1']))
      expect(reopened.cssBundles['cssabc']).toBe('i{}')
    })

    it('stores every css bundle a single call reports, one per side', async () => {
      const root = freshRoot()
      await writeToolCapture(openDb(root), {
        sessionId: 's1',
        toolCallId: 'call-1',
        bundle: {
          before: side('before', 'email', 'cssbefore'),
          after: side('after', 'email', 'cssafter'),
          cssBundles: [
            {hash: 'cssbefore', css: '.a{}'},
            {hash: 'cssafter', css: '.a{}.b{}'},
          ],
        },
      })

      const stored = await sessionCaptures(openDb(root), 's1')
      expect(stored.cssBundles['cssbefore']).toBe('.a{}')
      expect(stored.cssBundles['cssafter']).toBe('.a{}.b{}')
    })

    it('replaces a side rather than duplicating it when the same call reports twice', async () => {
      const root = freshRoot()
      const db = openDb(root)
      await writeToolCapture(db, {sessionId: 's1', toolCallId: 'call-1', bundle: {after: side('after', 'first')}})
      await writeToolCapture(db, {sessionId: 's1', toolCallId: 'call-1', bundle: {after: side('after', 'second')}})
      const stored = await sessionCaptures(db, 's1')
      expect(stored.captures).toHaveLength(1)
      expect(stored.captures[0]?.capture.descriptor.selectorPath).toBe('#second')
    })

    it('drops a session capture and only the css bundles nothing else references', async () => {
      const root = freshRoot()
      const db = openDb(root)
      await writeToolCapture(db, {
        sessionId: 's1',
        toolCallId: 'call-1',
        bundle: {after: side('after', 'a'), cssBundles: [{hash: 'cssabc', css: 'i{}'}]},
      })
      await writeToolCapture(db, {sessionId: 's2', toolCallId: 'call-2', bundle: {after: side('after', 'b')}})

      await deleteSessionCaptures(db, 's1')
      expect((await sessionCaptures(db, 's1')).captures).toEqual([])
      const survivor = await sessionCaptures(db, 's2')
      expect(survivor.captures).toHaveLength(1)
      expect(survivor.cssBundles['cssabc']).toBe('i{}')
    })

    it('leaves no orphan css bundle behind when a capture in the same call fails to write', async () => {
      const root = freshRoot()
      const db = openDb(root)
      await expect(
        writeToolCapture(db, {
          sessionId: 's1',
          toolCallId: 'call-1',
          bundle: {
            before: side('before', 'email'),
            after: unserializableSide('after', 'email'),
            cssBundles: [{hash: 'cssabc', css: 'i{}'}],
          },
        }),
      ).rejects.toThrow()

      const stored = await sessionCaptures(db, 's1')
      expect(stored.captures).toEqual([])
      expect(stored.cssBundles).toEqual({})
    })
  })
})

describe('chat persistence conformance', () => {
  runPersistenceConformance(
    'conciv-drizzle',
    () => {
      const db = openDb(mkdtempSync(join(tmpdir(), 'conciv-persistence-')))
      return defineAIPersistence({
        stores: {messages: createMessageStore(db), metadata: createMetadataStore(db), runs: createRunStore(db)},
      })
    },
    {skip: ['interrupts', 'generationRuns', 'artifacts', 'blobs']},
  )
})

describe('chat thread upgrade', () => {
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
})

describe('db', () => {
  function seedRunMessages(db: ConcivDb, sessionId: string, messages: unknown[]): void {
    db.insert(runMessages).values({sessionId, messages, updatedAt: 1}).run()
  }

  const record = (id: string) => ({
    id,
    harnessSessionId: null,
    harnessKind: 'claude',
    origin: 'chat' as const,
    title: null,
    model: null,
    usage: null,
    cwd: '/w',
    createdAt: 1,
    updatedAt: 1,
  })

  const PRE_MIGRATION_SESSIONS = `CREATE TABLE \`sessions\` (
	\`id\` text PRIMARY KEY,
	\`harness_session_id\` text,
	\`harness_kind\` text NOT NULL,
	\`origin\` text NOT NULL,
	\`title\` text,
	\`model\` text,
	\`usage\` text,
	\`cwd\` text NOT NULL,
	\`created_at\` integer NOT NULL,
	\`updated_at\` integer NOT NULL
);`

  const migrationUrl = new URL('../drizzle/20260730123834_transcript_cwd/migration.sql', import.meta.url)

  function atPreviousMigration(): DatabaseSync {
    const client = new DatabaseSync(':memory:')
    client.exec(PRE_MIGRATION_SESSIONS)
    return client
  }

  function runTranscriptCwdMigration(client: DatabaseSync): void {
    const sql = readFileSync(fileURLToPath(migrationUrl), 'utf8')
    for (const statement of sql.split('--> statement-breakpoint')) client.exec(statement)
  }

  describe('transcript cwd migration', () => {
    it('keeps the most recently updated row when a harness session id is duplicated', () => {
      const client = atPreviousMigration()
      const insert = client.prepare(
        'INSERT INTO sessions (id, harness_session_id, harness_kind, origin, cwd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      insert.run('conciv_1', 'tok', 'claude', 'chat', '/w', 1, 10)
      insert.run('conciv_2', 'tok', 'claude', 'chat', '/w', 2, 30)
      insert.run('conciv_3', 'tok', 'claude', 'chat', '/w', 3, 20)
      insert.run('conciv_4', null, 'claude', 'chat', '/w', 4, 40)
      insert.run('conciv_5', null, 'claude', 'chat', '/w', 5, 50)

      runTranscriptCwdMigration(client)

      expect(client.prepare('SELECT id FROM sessions WHERE harness_session_id = ?').all('tok')).toEqual([
        {id: 'conciv_2'},
      ])
      expect(client.prepare('SELECT count(*) AS n FROM sessions WHERE harness_session_id IS NULL').get()).toEqual({
        n: 4,
      })
      const indexes = client
        .prepare("PRAGMA index_list('sessions')")
        .all()
        .map((row) => row.name)
      expect(indexes).toContain('sessions_harness_session_id_unique')
      expect(() => insert.run('conciv_6', 'tok', 'claude', 'chat', '/w', 6, 60)).toThrow()
      client.close()
    })

    it('breaks an updated-at tie on the newest row', () => {
      const client = atPreviousMigration()
      const insert = client.prepare(
        'INSERT INTO sessions (id, harness_session_id, harness_kind, origin, cwd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      insert.run('conciv_1', 'tok', 'claude', 'chat', '/w', 1, 10)
      insert.run('conciv_2', 'tok', 'claude', 'chat', '/w', 2, 10)

      runTranscriptCwdMigration(client)

      expect(client.prepare('SELECT id FROM sessions WHERE harness_session_id = ?').all('tok')).toEqual([
        {id: 'conciv_2'},
      ])
      client.close()
    })

    it('leaves distinct harness session ids alone', () => {
      const client = atPreviousMigration()
      const insert = client.prepare(
        'INSERT INTO sessions (id, harness_session_id, harness_kind, origin, cwd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      insert.run('conciv_1', 'tok-a', 'claude', 'chat', '/w', 1, 10)
      insert.run('conciv_2', 'tok-b', 'claude', 'chat', '/w', 2, 5)

      runTranscriptCwdMigration(client)

      expect(client.prepare('SELECT id, harness_session_id FROM sessions ORDER BY id').all()).toEqual([
        {id: 'conciv_1', harness_session_id: 'tok-a'},
        {id: 'conciv_2', harness_session_id: 'tok-b'},
      ])
      client.close()
    })

    it('boots a fresh db with the attach columns and rejects a duplicate token', () => {
      const db = openDb(mkdtempSync(join(tmpdir(), 'conciv-db-cwd-')))
      db.insert(sessions)
        .values({
          ...record('conciv_a'),
          harnessSessionId: 'tok',
          transcriptCwd: '/other',
          attachedPid: 42,
          attachedAt: 7,
        })
        .run()
      const row = db.select().from(sessions).all()[0]
      expect(row?.transcriptCwd).toBe('/other')
      expect(row?.attachedPid).toBe(42)
      expect(row?.attachedAt).toBe(7)
      expect(() =>
        db
          .insert(sessions)
          .values({...record('conciv_b'), harnessSessionId: 'tok'})
          .run(),
      ).toThrow()
    })
  })

  describe('openDb', () => {
    it('sessions round-trip through the typed orm', () => {
      const db = openDb(mkdtempSync(join(tmpdir(), 'conciv-db-')))
      db.insert(sessions).values(record('conciv_a')).run()
      const rows = db.select().from(sessions).where(eq(sessions.id, 'conciv_a')).all()
      expect(rows[0]?.cwd).toBe('/w')
      db.update(sessions).set({title: 'named', updatedAt: 2}).where(eq(sessions.id, 'conciv_a')).run()
      expect(db.select().from(sessions).all()[0]?.title).toBe('named')
    })

    it('boot detach hands a stuck run to the reclaim sweep, leaving session and run rows alone', async () => {
      const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-db-sweep-'))
      const first = openDb(stateRoot)
      first
        .insert(sessions)
        .values({...record('conciv_z'), title: 'keep'})
        .run()
      await createRunStore(first).createOrResume({runId: 'run-stuck', threadId: 'conciv_z', startedAt: Date.now()})
      seedRunMessages(first, 'conciv_z', [{id: 'm1'}])
      const second = openDb(stateRoot)
      expect(second.select().from(sessions).all()[0]?.title).toBe('keep')
      const reclaimable = await createRunStore(second).listReclaimable?.({now: Date.now(), ttlMs: 0})
      expect(reclaimable?.map((run) => run.runId)).toEqual(['run-stuck'])
      expect(runMessagesFor(second, 'conciv_z')?.messages).toEqual([{id: 'm1'}])
    })

    it('boot sweep neither folds nor wipes run rows: openDb has no harness and cannot decide', () => {
      const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-db-fold-'))
      const first = openDb(stateRoot)
      const imageTurn = [
        {
          id: 'u1',
          role: 'user',
          parts: [{type: 'image', source: {type: 'data', value: 'aGk=', mimeType: 'image/png'}}],
        },
      ]
      const textTurn = [{id: 't1', role: 'user', parts: [{type: 'text', content: 'hi'}]}]
      seedRunMessages(first, 'conciv_img', imageTurn)
      seedRunMessages(first, 'conciv_txt', textTurn)
      const second = openDb(stateRoot)
      expect(runMessagesFor(second, 'conciv_img')?.messages).toEqual(imageTurn)
      expect(runMessagesFor(second, 'conciv_txt')?.messages).toEqual(textTurn)
      expect(sessionHistoryFor(second, 'conciv_img')).toBeNull()
      expect(sessionHistoryFor(second, 'conciv_txt')).toBeNull()
    })

    it('two connections on one stateRoot interleave writes (WAL + busy timeout)', () => {
      const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-db-multi-'))
      const first = openDb(stateRoot)
      const second = openDb(stateRoot)
      first.insert(sessions).values(record('conciv_a')).run()
      second.insert(sessions).values(record('conciv_b')).run()
      first.update(sessions).set({title: 'from-first'}).where(eq(sessions.id, 'conciv_b')).run()
      const ids = second
        .select({id: sessions.id})
        .from(sessions)
        .all()
        .map((row) => row.id)
        .toSorted()
      expect(ids).toEqual(['conciv_a', 'conciv_b'])
      expect(second.select().from(sessions).where(eq(sessions.id, 'conciv_b')).all()[0]?.title).toBe('from-first')
    })

    it('drizzle row type matches SessionRecord (id brand applied by zod parse)', () => {
      expectTypeOf<Omit<typeof sessions.$inferSelect, 'id'>>().toEqualTypeOf<Omit<SessionRecord, 'id'>>()
      expectTypeOf<(typeof sessions.$inferSelect)['id']>().toEqualTypeOf<string>()
      expectTypeOf<SessionRecord['id']>().toExtend<string>()
    })
  })
})

describe('run queries', () => {
  const fresh = () => openDb(mkdtempSync(join(tmpdir(), 'conciv-run-')))

  describe('run lifecycle queries', () => {
    it('reads fall back safely for unknown sessions', () => {
      const db = fresh()
      expect(modelOf(db, 'missing')).toBeNull()
      expect(runMessagesFor(db, 'missing')).toBeNull()
      expect(sessionHistoryFor(db, 'missing')).toBeNull()
    })

    it('modelOf reads the sessions row', () => {
      const db = fresh()
      db.insert(sessions)
        .values({
          id: 'conciv_m',
          harnessSessionId: null,
          harnessKind: 'claude',
          origin: 'chat',
          title: null,
          model: 'haiku',
          usage: null,
          cwd: '/w',
          createdAt: 1,
          updatedAt: 1,
        })
        .run()
      expect(modelOf(db, 'conciv_m')).toBe('haiku')
    })

    it('clearRunState drops the thread, its markers and the legacy rows for that session only', () => {
      const db = fresh()
      updateThread(db, 's5', () => ({
        messages: [{role: 'user', content: 'gone'}],
        pendingFrom: 0,
        anchor: {nativeId: 'native-5'},
      }))
      updateThread(db, 'other', () => ({
        messages: [{role: 'user', content: 'kept'}],
        pendingFrom: null,
        anchor: null,
      }))
      db.insert(runMessages)
        .values({sessionId: 's5', messages: [{id: 'legacy'}], updatedAt: 1})
        .run()
      db.insert(sessionHistory)
        .values({sessionId: 's5', messages: [{id: 'legacy'}], updatedAt: 1})
        .run()

      clearRunState(db, 's5')

      expect(readThread(db, 's5')).toEqual({messages: [], pendingFrom: null, anchor: null})
      expect(runMessagesFor(db, 's5')).toBeNull()
      expect(sessionHistoryFor(db, 's5')).toBeNull()
      expect(readThread(db, 'other').messages).toEqual([{role: 'user', content: 'kept'}])
    })
  })
})

describe('run records', () => {
  const fresh = () => openDb(mkdtempSync(join(tmpdir(), 'conciv-run-records-')))
  const freshStore = () => createRunStore(fresh())
  const stateRoot = () => mkdtempSync(join(tmpdir(), 'conciv-run-restart-'))

  describe('durable run records', () => {
    it('round-trips a terminal run record through the migrated schema', async () => {
      const store = freshStore()
      await store.createOrResume({runId: 'run-a', threadId: 's1', startedAt: 1000})
      await store.update('run-a', {status: 'completed', finishedAt: 2000})
      await expect(store.listByThread?.('s1')).resolves.toEqual([
        {runId: 'run-a', threadId: 's1', status: 'completed', startedAt: 1000, finishedAt: 2000},
      ])
    })

    it('keeps the terminal error of a failed run', async () => {
      const store = freshStore()
      await store.createOrResume({runId: 'run-b', threadId: 's2', startedAt: 10})
      await store.update('run-b', {
        status: 'failed',
        finishedAt: 20,
        error: {message: 'claude produced no output within 5s'},
      })
      await expect(store.get('run-b')).resolves.toMatchObject({
        error: {message: 'claude produced no output within 5s'},
      })
    })

    it('advances one run record from running to its terminal phase instead of appending a second row', async () => {
      const store = freshStore()
      await store.createOrResume({runId: 'run-c', threadId: 's3', startedAt: 5})
      const started = await store.get('run-c')
      expect(started?.status).toBe('running')
      expect(started?.finishedAt).toBeUndefined()
      await store.update('run-c', {status: 'completed', finishedAt: 9})
      await expect(store.listByThread?.('s3')).resolves.toMatchObject([
        {runId: 'run-c', status: 'completed', finishedAt: 9},
      ])
    })

    it('returns the newest run of a session last', async () => {
      const store = freshStore()
      await store.createOrResume({runId: 'old', threadId: 's4', startedAt: 1})
      await store.update('old', {status: 'completed', finishedAt: 2})
      await store.createOrResume({runId: 'new', threadId: 's4', startedAt: 3})
      await store.update('new', {status: 'completed', finishedAt: 4})
      const listed = await store.listByThread?.('s4')
      expect(listed?.at(-1)?.runId).toBe('new')
    })

    it('survives reopening the database over the same state root', async () => {
      const root = stateRoot()
      const first = createRunStore(openDb(root))
      await first.createOrResume({runId: 'run-d', threadId: 's5', startedAt: 100})
      await first.update('run-d', {status: 'completed', finishedAt: 200})
      await expect(createRunStore(openDb(root)).get('run-d')).resolves.toMatchObject({
        runId: 'run-d',
        status: 'completed',
        finishedAt: 200,
      })
    })
  })
})

describe('run store', () => {
  const stateRoot = () => mkdtempSync(join(tmpdir(), 'conciv-run-store-boot-'))

  describe('the legacy run backfill', () => {
    it('imports a terminal legacy run row into the chat_runs store', async () => {
      const root = stateRoot()
      const first = openDb(root)
      first
        .insert(runs)
        .values({
          runId: 'legacy-done',
          sessionId: 'thread-legacy',
          phase: 'completed',
          startedAt: 100,
          finishedAt: 200,
          error: null,
          updatedAt: 200,
        })
        .run()
      const store = createRunStore(openDb(root))
      await expect(store.get('legacy-done')).resolves.toMatchObject({
        runId: 'legacy-done',
        threadId: 'thread-legacy',
        status: 'completed',
        startedAt: 100,
        finishedAt: 200,
      })
    })

    it('imports a stopping legacy run as a running record carrying the cancel request', async () => {
      const root = stateRoot()
      openDb(root)
        .insert(runs)
        .values({
          runId: 'legacy-stopping',
          sessionId: 'thread-legacy',
          phase: 'stopping',
          startedAt: 100,
          finishedAt: null,
          error: null,
          updatedAt: 100,
        })
        .run()
      const record = await createRunStore(openDb(root)).get('legacy-stopping')
      expect(record).toMatchObject({status: 'running', cancelRequested: true})
      expect(record?.finishedAt).toBeUndefined()
    })

    it('keeps the legacy error prose on an imported failed run', async () => {
      const root = stateRoot()
      openDb(root)
        .insert(runs)
        .values({
          runId: 'legacy-failed',
          sessionId: 'thread-legacy',
          phase: 'failed',
          startedAt: 1,
          finishedAt: 2,
          error: 'claude produced no output within 5s',
          updatedAt: 2,
        })
        .run()
      const record = await createRunStore(openDb(root)).get('legacy-failed')
      expect(record?.error).toEqual({message: 'claude produced no output within 5s'})
    })

    it('never re-imports over a record the store has since written', async () => {
      const root = stateRoot()
      openDb(root)
        .insert(runs)
        .values({
          runId: 'legacy-reimport',
          sessionId: 'thread-legacy',
          phase: 'running',
          startedAt: 1,
          finishedAt: null,
          error: null,
          updatedAt: 1,
        })
        .run()
      const store = createRunStore(openDb(root))
      await store.update('legacy-reimport', {status: 'completed', finishedAt: 42})
      const reopened = createRunStore(openDb(root))
      await expect(reopened.get('legacy-reimport')).resolves.toMatchObject({status: 'completed', finishedAt: 42})
    })
  })

  describe('the boot detach stamp', () => {
    it('hands a run left running by a dead process to listReclaimable on the next open', async () => {
      const root = stateRoot()
      await createRunStore(openDb(root)).createOrResume({runId: 'stuck', threadId: 'thread-stuck', startedAt: 10})
      const reopened = createRunStore(openDb(root))
      const reclaimable = await reopened.listReclaimable?.({now: Date.now(), ttlMs: 0})
      expect(reclaimable?.map((record) => record.runId)).toEqual(['stuck'])
    })

    it('leaves a terminal run out of the reclaimable set', async () => {
      const root = stateRoot()
      const store = createRunStore(openDb(root))
      await store.createOrResume({runId: 'finished', threadId: 'thread-finished', startedAt: 10})
      await store.update('finished', {status: 'completed', finishedAt: 20})
      const reopened = createRunStore(openDb(root))
      await expect(reopened.listReclaimable?.({now: Date.now(), ttlMs: 0})).resolves.toEqual([])
    })
  })
})

describe('thread queries', () => {
  const fresh = () => openDb(mkdtempSync(join(tmpdir(), 'conciv-thread-')))

  describe('the chat thread store', () => {
    it('reads an empty state for a thread that was never written', () => {
      const db = fresh()
      expect(readThread(db, 't1')).toEqual({messages: [], pendingFrom: null, anchor: null})
    })

    it('round-trips messages, the pending marker and the anchor', () => {
      const db = fresh()
      updateThread(db, 't2', (state) => ({
        messages: [...state.messages, {role: 'user', content: 'one'}],
        pendingFrom: 0,
        anchor: {nativeId: 'native-2'},
      }))
      expect(readThread(db, 't2')).toEqual({
        messages: [{role: 'user', content: 'one'}],
        pendingFrom: 0,
        anchor: {nativeId: 'native-2'},
      })
      expect(threadMessages(db, 't2')).toEqual([{role: 'user', content: 'one'}])
    })

    it('clears the pending marker and the anchor when the fold returns null for them', () => {
      const db = fresh()
      updateThread(db, 't3', () => ({messages: [], pendingFrom: 2, anchor: {nativeId: null}}))
      expect(readThread(db, 't3').anchor).toEqual({nativeId: null})
      updateThread(db, 't3', (state) => ({...state, pendingFrom: null, anchor: null}))
      expect(readThread(db, 't3')).toEqual({messages: [], pendingFrom: null, anchor: null})
    })

    it('lists exactly the threads that carry a pending marker', () => {
      const db = fresh()
      updateThread(db, 'conciv_a', () => ({messages: [], pendingFrom: 0, anchor: null}))
      updateThread(db, 'conciv_b', () => ({messages: [], pendingFrom: null, anchor: {nativeId: 'n'}}))
      expect(pendingThreadIds(db)).toEqual(['conciv_a'])
    })

    it('deleteThread removes the messages, the marker and the anchor', () => {
      const db = fresh()
      updateThread(db, 't4', () => ({
        messages: [{role: 'user', content: 'x'}],
        pendingFrom: 0,
        anchor: {nativeId: 'n'},
      }))
      deleteThread(db, 't4')
      expect(readThread(db, 't4')).toEqual({messages: [], pendingFrom: null, anchor: null})
      expect(pendingThreadIds(db)).toEqual([])
    })
  })
})
