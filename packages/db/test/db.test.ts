import {tmpdir} from 'node:os'
import {join} from 'node:path'
import type {ElementCapture, ElementCaptureKind} from '@conciv/protocol/element-capture-types'
import {deleteSessionCaptures, sessionCaptures, writeToolCapture} from '../src/capture-queries.js'
import {mkdtempSync, readFileSync} from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {fileURLToPath} from 'node:url'
import {eq} from 'drizzle-orm'
import {describe, expect, it, expectTypeOf} from 'vitest'
import type {SessionRecord} from '@conciv/protocol/chat-types'
import {openDb, type ConcivDb} from '../src/db.js'
import {runMessages} from '../src/run-schema.js'
import {sessions} from '../src/schema.js'
import {modelOf, runMessagesFor, sessionHistoryFor} from '../src/run-queries.js'

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
  })
})
