import {mkdtempSync, readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {fileURLToPath} from 'node:url'
import {eq} from 'drizzle-orm'
import {describe, expect, it, expectTypeOf} from 'vitest'
import type {SessionRecord} from '@conciv/protocol/chat-types'
import {openDb} from '../src/db.js'
import {recordRunLifecycle, runMessagesFor, sessionHistoryFor, setRunMessages} from '../src/run-queries.js'
import {sessions} from '../src/schema.js'
import {runs} from '../src/run-schema.js'

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
    expect(client.prepare('SELECT count(*) AS n FROM sessions WHERE harness_session_id IS NULL').get()).toEqual({n: 4})
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
      .values({...record('conciv_a'), harnessSessionId: 'tok', transcriptCwd: '/other', attachedPid: 42, attachedAt: 7})
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

  it('boot sweep abandons stuck runs, leaving run rows for capability-aware recovery', () => {
    const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-db-sweep-'))
    const first = openDb(stateRoot)
    first
      .insert(sessions)
      .values({...record('conciv_z'), title: 'keep'})
      .run()
    recordRunLifecycle(first, 'conciv_z', {
      runId: 'run-stuck',
      phase: 'running',
      startedAt: Date.now(),
      finishedAt: null,
      serverNow: Date.now(),
      error: null,
    })
    setRunMessages(first, 'conciv_z', [{id: 'm1'}])
    const second = openDb(stateRoot)
    expect(second.select().from(sessions).all()[0]?.title).toBe('keep')
    expect(second.select().from(runs).where(eq(runs.sessionId, 'conciv_z')).all()[0]?.phase).toBe('aborted')
    expect(runMessagesFor(second, 'conciv_z')?.messages).toEqual([{id: 'm1'}])
  })

  it('boot sweep neither folds nor wipes run rows: openDb has no harness and cannot decide', () => {
    const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-db-fold-'))
    const first = openDb(stateRoot)
    const imageTurn = [
      {id: 'u1', role: 'user', parts: [{type: 'image', source: {type: 'data', value: 'aGk=', mimeType: 'image/png'}}]},
    ]
    const textTurn = [{id: 't1', role: 'user', parts: [{type: 'text', content: 'hi'}]}]
    setRunMessages(first, 'conciv_img', imageTurn)
    setRunMessages(first, 'conciv_txt', textTurn)
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
