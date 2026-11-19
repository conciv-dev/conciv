import {join} from 'node:path'
import type {ElementCapture, ElementCaptureKind} from '@conciv/protocol/element-capture-types'
import {deleteSessionCaptures, sessionCaptures, writeToolCapture} from '../src/capture-queries.js'
import {existsSync, mkdirSync, readdirSync, readFileSync, statSync, symlinkSync} from 'node:fs'
import {createServer, type Server} from 'node:http'
import {Worker} from 'node:worker_threads'
import {once} from 'node:events'
import envPaths from 'env-paths'
import {DatabaseSync} from 'node:sqlite'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {asc, eq, is} from 'drizzle-orm'
import {drizzle} from 'drizzle-orm/node-sqlite'
import {getTableConfig, SQLiteTable} from 'drizzle-orm/sqlite-core'
import {makeWithDefaults} from 'drizzle-orm/effect-sqlite-node'
import {SqliteClient} from '@effect/sql-sqlite-node'
import {Effect, Exit, Layer, Scope} from 'effect'
import {describe, expect, it, expectTypeOf, onTestFinished} from 'vitest'
import {z} from 'zod'
import * as schema from '../src/schema.js'
import * as runSchema from '../src/run-schema.js'
import type {SessionRecord} from '@conciv/protocol/chat-types'
import {openDb, type ConcivDb} from '../src/db.js'
import {importLegacyThreads} from '../src/chat-thread-import.js'
import {chatMessages, chatRuns, runMessages, runs, sessionHistory} from '../src/run-schema.js'
import {drafts, sessions} from '../src/schema.js'
import {readModel, runMessagesFor} from '../src/run-queries.js'
import {
  closeHomeDb,
  concivHome,
  hubConnections,
  lastHubRevocation,
  isHomeFolderRefused,
  listEngines,
  openHomeDb,
  recordHubConnection,
  registerEngine,
  endHubOperation,
  readHomeDb,
  takeHubOperation,
  removeHubConnection,
  retireEngine,
  withHomeDb,
} from '../src/home-db.js'
import {engines} from '../src/home-schema.js'
import {homeMigrations} from '../src/home-migrations.gen.js'
import {migrations} from '../src/migrations.gen.js'
import {checkEngines} from '../src/engine-check.js'
import {tempDir} from '@conciv/vitest-config/temp-dir'

function opened(stateRoot: string): Promise<ConcivDb> {
  const scope = Scope.makeUnsafe()
  onTestFinished(() => Effect.runPromise(Scope.close(scope, Exit.void)))
  return Effect.runPromise(openDb(stateRoot).pipe(Scope.provide(scope)))
}

function legacyHistoryRows(db: ConcivDb, sessionId: string) {
  return Effect.runSync(db.select().from(sessionHistory).where(eq(sessionHistory.sessionId, sessionId)))
}

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
    return tempDir('conciv-captures-')
  }

  describe('tool captures outlive the run that produced them', () => {
    it('keeps both sides of one tool call and hands them back after the database is reopened', async () => {
      const root = freshRoot()
      await writeToolCapture(await opened(root), {
        sessionId: 's1',
        toolCallId: 'call-1',
        bundle: {
          before: side('before', 'email'),
          after: side('after', 'email'),
          cssBundles: [{hash: 'cssabc', css: 'i{}'}],
        },
      })

      const reopened = await sessionCaptures(await opened(root), 's1')
      expect(reopened.captures.map((row) => row.kind).toSorted()).toEqual(['after', 'before'])
      expect(new Set(reopened.captures.map((row) => row.toolCallId))).toEqual(new Set(['call-1']))
      expect(reopened.cssBundles['cssabc']).toBe('i{}')
    })

    it('stores every css bundle a single call reports, one per side', async () => {
      const root = freshRoot()
      await writeToolCapture(await opened(root), {
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

      const stored = await sessionCaptures(await opened(root), 's1')
      expect(stored.cssBundles['cssbefore']).toBe('.a{}')
      expect(stored.cssBundles['cssafter']).toBe('.a{}.b{}')
    })

    it('replaces a side rather than duplicating it when the same call reports twice', async () => {
      const root = freshRoot()
      const db = await opened(root)
      await writeToolCapture(db, {sessionId: 's1', toolCallId: 'call-1', bundle: {after: side('after', 'first')}})
      await writeToolCapture(db, {sessionId: 's1', toolCallId: 'call-1', bundle: {after: side('after', 'second')}})
      const stored = await sessionCaptures(db, 's1')
      expect(stored.captures).toHaveLength(1)
      expect(stored.captures[0]?.capture.descriptor.selectorPath).toBe('#second')
    })

    it('drops a session capture and only the css bundles nothing else references', async () => {
      const root = freshRoot()
      const db = await opened(root)
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
      const db = await opened(root)
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
    Effect.runSync(db.insert(runMessages).values({sessionId, messages, updatedAt: 1}))
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

    it('boots a fresh db with the attach columns and rejects a duplicate token', async () => {
      const db = await opened(tempDir('conciv-db-cwd-'))
      Effect.runSync(
        db.insert(sessions).values({
          ...record('conciv_a'),
          harnessSessionId: 'tok',
          transcriptCwd: '/other',
          attachedPid: 42,
          attachedAt: 7,
        }),
      )
      const row = Effect.runSync(db.select().from(sessions))[0]
      expect(row?.transcriptCwd).toBe('/other')
      expect(row?.attachedPid).toBe(42)
      expect(row?.attachedAt).toBe(7)
      expect(() =>
        Effect.runSync(db.insert(sessions).values({...record('conciv_b'), harnessSessionId: 'tok'})),
      ).toThrow()
    })
  })

  const drizzleDir = fileURLToPath(new URL('../drizzle/', import.meta.url))

  function applyMigration(client: DatabaseSync, name: string): void {
    const sql = readFileSync(join(drizzleDir, name, 'migration.sql'), 'utf8')
    for (const statement of sql.split('--> statement-breakpoint')) client.exec(statement)
  }

  function migrationsFrom(first: string): string[] {
    return readdirSync(drizzleDir)
      .filter((name) => name >= first)
      .toSorted()
  }

  function beforeMigration(migration: string, file = ':memory:'): DatabaseSync {
    const client = new DatabaseSync(file)
    readdirSync(drizzleDir)
      .filter((name) => name < migration)
      .toSorted()
      .forEach((name) => applyMigration(client, name))
    return client
  }

  function threadRows(db: ReturnType<typeof drizzle>, threadId: string) {
    return db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.threadId, threadId))
      .orderBy(asc(chatMessages.position))
      .all()
  }

  describe('chat messages migration', () => {
    const MESSAGES_MIGRATION = readdirSync(drizzleDir).find((name) => name.endsWith('_chat_messages')) ?? 'missing'
    const STORED = [
      {id: 'u0', role: 'user', content: 'first question'},
      {
        id: 'a0',
        role: 'assistant',
        content: null,
        toolCalls: [{id: 'call-1', type: 'function', function: {name: 'look', arguments: '{}'}}],
      },
      {role: 'tool', toolCallId: 'call-1', content: 'looked'},
      {id: 'a0b', role: 'assistant', content: 'done'},
    ]

    it('moves every stored transcript into one row per message, readable whole and by page', async () => {
      const client = beforeMigration(MESSAGES_MIGRATION)
      client
        .prepare('INSERT INTO chat_threads (thread_id, messages_json, updated_at) VALUES (?, ?, ?)')
        .run('conciv_old', JSON.stringify(STORED), 1)

      migrationsFrom(MESSAGES_MIGRATION).forEach((name) => applyMigration(client, name))

      const rows = threadRows(drizzle({client}), 'conciv_old')
      expect(rows.map((row) => row.messageJson)).toEqual(STORED)
      expect(rows.map((row) => [row.messageId, row.role])).toEqual(
        STORED.map((message) => [message.id ?? null, message.role]),
      )
      expect(client.prepare("SELECT name FROM sqlite_master WHERE name = 'chat_threads'").all()).toEqual([])
      client.close()
    })
  })

  describe('legacy thread import', () => {
    it('imports a legacy thread longer than the sqlite variable limit allows in one insert', async () => {
      const file = join(tempDir('conciv-db-import-'), 'conciv.db')
      const client = beforeMigration('99999999999999_after_every_migration', file)
      const pending = Array.from({length: 7000}, (_, index) => ({
        id: `m${index}`,
        role: 'user',
        parts: [{type: 'text', content: `message ${index}`}],
      }))
      client
        .prepare('INSERT INTO run_messages (session_id, messages, updated_at) VALUES (?, ?, ?)')
        .run('conciv_long', JSON.stringify(pending), 1)
      client.close()

      const rows = await Effect.runPromise(
        Effect.gen(function* () {
          const db = yield* makeWithDefaults().pipe(
            Effect.provide(yield* Layer.build(SqliteClient.layer({filename: file}))),
          )
          yield* importLegacyThreads(db, 1)
          return yield* db
            .select()
            .from(chatMessages)
            .where(eq(chatMessages.threadId, 'conciv_long'))
            .orderBy(asc(chatMessages.position))
        }).pipe(Effect.scoped),
      )

      const stored = rows.map((row) => row.messageJson)
      expect(stored).toHaveLength(7000)
      expect(stored.at(-1)).toMatchObject({id: 'm6999', role: 'user', content: 'message 6999'})
    })
  })

  describe('chat run harness migration', () => {
    const HARNESS_MIGRATION = '20261105092249_chat_run_harness'

    it('tags every existing run with the harness of its session, and an orphan run with claude', () => {
      const client = beforeMigration(HARNESS_MIGRATION)
      client
        .prepare(
          'INSERT INTO sessions (id, harness_kind, origin, cwd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run('conciv_codex', 'codex', 'chat', '/w', 1, 1)
      const run = client.prepare('INSERT INTO chat_runs (run_id, thread_id, status, started_at) VALUES (?, ?, ?, ?)')
      run.run('run-codex', 'conciv_codex', 'completed', 1)
      run.run('run-orphan', 'conciv_gone', 'completed', 2)

      applyMigration(client, HARNESS_MIGRATION)

      expect(client.prepare('SELECT run_id, harness_id FROM chat_runs ORDER BY run_id').all()).toEqual([
        {run_id: 'run-codex', harness_id: 'codex'},
        {run_id: 'run-orphan', harness_id: 'claude'},
      ])
      expect(() => run.run('run-untagged', 'conciv_codex', 'running', 3)).toThrow()
      client.close()
    })

    it('imports a legacy run under the harness of its session', async () => {
      const stateRoot = tempDir('conciv-db-legacy-run-')
      const first = await opened(stateRoot)
      Effect.runSync(first.insert(sessions).values({...record('conciv_pi'), harnessKind: 'pi'}))
      Effect.runSync(
        first
          .insert(runs)
          .values({runId: 'legacy-run', sessionId: 'conciv_pi', phase: 'completed', startedAt: 1, updatedAt: 1}),
      )
      const second = await opened(stateRoot)
      expect(
        Effect.runSync(second.select({runId: chatRuns.runId, harnessId: chatRuns.harnessId}).from(chatRuns)),
      ).toEqual([{runId: 'legacy-run', harnessId: 'pi'}])
    })
  })

  describe('session metadata migration', () => {
    it('gives an existing session an empty metadata record, which then holds a json record', () => {
      const migration = readdirSync(drizzleDir).find((name) => name.endsWith('_session_metadata')) ?? 'missing'
      const client = beforeMigration(migration)
      client
        .prepare(
          'INSERT INTO sessions (id, harness_kind, origin, cwd, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run('conciv_old', 'claude', 'chat', '/w', 1, 1)

      migrationsFrom(migration).forEach((name) => applyMigration(client, name))

      const db = drizzle({client})
      expect(db.select({metadata: sessions.metadata}).from(sessions).all()).toEqual([{metadata: null}])
      const metadata = {owner: 'review', round: 2, nested: {tags: ['a', 'b'], done: false}}
      db.update(sessions).set({metadata}).where(eq(sessions.id, 'conciv_old')).run()
      expect(db.select({metadata: sessions.metadata}).from(sessions).all()).toEqual([{metadata}])
      client.close()
    })
  })

  describe('draft items migration', () => {
    it('gives an existing draft no items, which then holds a json list', () => {
      const migration = readdirSync(drizzleDir).find((name) => name.endsWith('_draft_items')) ?? 'missing'
      const client = beforeMigration(migration)
      client
        .prepare(
          'INSERT INTO drafts (session_id, text, selection_start, selection_end, updated_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run('conciv_old', 'an old draft', 0, 0, 1)

      migrationsFrom(migration).forEach((name) => applyMigration(client, name))

      const db = drizzle({client})
      expect(db.select({text: drafts.text, items: drafts.items}).from(drafts).all()).toEqual([
        {text: 'an old draft', items: null},
      ])
      const items = [{key: 'note:grab:c=1', value: {comment: 'make it blue', nested: {tags: ['a'], done: false}}}]
      db.update(drafts).set({items}).where(eq(drafts.sessionId, 'conciv_old')).run()
      expect(db.select({items: drafts.items}).from(drafts).all()).toEqual([{items}])
      client.close()
    })
  })

  describe('plugin host tables migration', () => {
    it('creates the plugin host tables, and a database a branch build already gave them keeps its rows', () => {
      const migration = readdirSync(drizzleDir).find((name) => name.endsWith('_plugin_host_tables')) ?? 'missing'
      const tables = (client: DatabaseSync) =>
        client
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('event_sequence', 'event', 'kv', 'permission') ORDER BY name",
          )
          .all()
          .map((row) => row.name)
      const fresh = beforeMigration(migration)
      migrationsFrom(migration).forEach((name) => applyMigration(fresh, name))
      expect(tables(fresh)).toEqual(['event', 'event_sequence', 'kv', 'permission'])
      fresh.close()

      const built = beforeMigration(migration)
      applyMigration(built, migration)
      built.prepare("INSERT INTO kv (key, value, time_created, time_updated) VALUES ('kept', '1', 1, 1)").run()
      migrationsFrom(migration).forEach((name) => applyMigration(built, name))
      expect(built.prepare('SELECT key FROM kv').all()).toEqual([{key: 'kept'}])
      built.close()
    })
  })

  describe('migrations folder', () => {
    const SnapshotSchema = z.object({
      id: z.string(),
      prevIds: z.array(z.string()),
      ddl: z.array(z.object({entityType: z.string(), name: z.string(), table: z.string().optional()})),
    })

    it('is one chain whose latest snapshot holds every column the schema declares', () => {
      const snapshots = migrationsFrom('').map((name) => ({
        name,
        ...SnapshotSchema.parse(JSON.parse(readFileSync(join(drizzleDir, name, 'snapshot.json'), 'utf8'))),
      }))
      const brokenLinks = snapshots
        .map((snapshot, index) => ({
          name: snapshot.name,
          prevIds: snapshot.prevIds,
          parent: [snapshots[index - 1]?.id ?? '00000000-0000-0000-0000-000000000000'],
        }))
        .filter((link) => link.prevIds.join() !== link.parent.join())
      expect.soft(brokenLinks).toEqual([])

      const latestColumns = (snapshots.at(-1)?.ddl ?? [])
        .filter((entity) => entity.entityType === 'columns')
        .map((entity) => `${entity.table}.${entity.name}`)
      const missingColumns = [...Object.values(schema), ...Object.values(runSchema)]
        .filter((value) => is(value, SQLiteTable))
        .flatMap((table) => {
          const config = getTableConfig(table)
          return config.columns.map((column) => `${config.name}.${column.name}`)
        })
        .filter((column) => !latestColumns.includes(column))
      expect(missingColumns).toEqual([])
    })
  })

  describe('openDb', () => {
    it('sessions round-trip through the typed orm', async () => {
      const db = await opened(tempDir('conciv-db-'))
      Effect.runSync(db.insert(sessions).values(record('conciv_a')))
      const rows = Effect.runSync(db.select().from(sessions).where(eq(sessions.id, 'conciv_a')))
      expect(rows[0]?.cwd).toBe('/w')
      Effect.runSync(db.update(sessions).set({title: 'named', updatedAt: 2}).where(eq(sessions.id, 'conciv_a')))
      expect(Effect.runSync(db.select().from(sessions))[0]?.title).toBe('named')
    })

    it('boot sweep neither folds nor wipes run rows: openDb has no harness and cannot decide', async () => {
      const stateRoot = tempDir('conciv-db-fold-')
      const first = await opened(stateRoot)
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
      const second = await opened(stateRoot)
      expect((await runMessagesFor(second, 'conciv_img'))?.messages).toEqual(imageTurn)
      expect((await runMessagesFor(second, 'conciv_txt'))?.messages).toEqual(textTurn)
      expect(legacyHistoryRows(second, 'conciv_img')).toEqual([])
      expect(legacyHistoryRows(second, 'conciv_txt')).toEqual([])
    })

    it('two connections on one stateRoot interleave writes (WAL + busy timeout)', async () => {
      const stateRoot = tempDir('conciv-db-multi-')
      const first = await opened(stateRoot)
      const second = await opened(stateRoot)
      Effect.runSync(first.insert(sessions).values(record('conciv_a')))
      Effect.runSync(second.insert(sessions).values(record('conciv_b')))
      Effect.runSync(first.update(sessions).set({title: 'from-first'}).where(eq(sessions.id, 'conciv_b')))
      const ids = Effect.runSync(second.select({id: sessions.id}).from(sessions))
        .map((row) => row.id)
        .toSorted()
      expect(ids).toEqual(['conciv_a', 'conciv_b'])
      expect(Effect.runSync(second.select().from(sessions).where(eq(sessions.id, 'conciv_b')))[0]?.title).toBe(
        'from-first',
      )
    })

    it('two connections opening a fresh project db at the same instant both succeed', async () => {
      const dbModule = new URL('../src/db.ts', import.meta.url).href
      const effect = pathToFileURL(createRequire(dbModule).resolve('effect')).href
      const counts = await openTwiceAtOnce((folder) => ({module: dbModule, open: 'openDb', folder, effect}))
      expect(counts).toEqual(Array.from({length: 16}, () => ({migrations: migrations.length})))
    })

    it('drizzle row type matches SessionRecord (id brands applied by zod parse)', () => {
      type Branded = 'id' | 'harnessSessionId'
      expectTypeOf<Omit<typeof sessions.$inferSelect, Branded>>().toEqualTypeOf<Omit<SessionRecord, Branded>>()
      expectTypeOf<(typeof sessions.$inferSelect)['id']>().toEqualTypeOf<string>()
      expectTypeOf<SessionRecord['id']>().toExtend<string>()
      expectTypeOf<(typeof sessions.$inferSelect)['harnessSessionId']>().toEqualTypeOf<string | null>()
      expectTypeOf<SessionRecord['harnessSessionId']>().toExtend<string | null>()
    })
  })
})

describe('run queries', () => {
  const fresh = () => opened(tempDir('conciv-run-'))

  describe('run lifecycle queries', () => {
    it('reads fall back safely for unknown sessions', async () => {
      const db = await fresh()
      expect(await readModel(db, 'missing')).toBeNull()
      expect(await runMessagesFor(db, 'missing')).toBeNull()
      expect(legacyHistoryRows(db, 'missing')).toEqual([])
    })

    it('readModel reads the sessions row', async () => {
      const db = await fresh()
      Effect.runSync(
        db.insert(sessions).values({
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
        }),
      )
      expect(await readModel(db, 'conciv_m')).toBe('haiku')
    })
  })
})

describe('home db', () => {
  const packageJsonPath = fileURLToPath(new URL('../package.json', import.meta.url))
  const homeDbModule = new URL('../src/home-db.ts', import.meta.url).href

  function freshHome(): string {
    return join(tempDir('conciv-home-'), 'home')
  }

  async function listen(handler: Parameters<typeof createServer>[1]): Promise<{server: Server; origin: string}> {
    const server = createServer(handler)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('no port')
    return {server, origin: `http://127.0.0.1:${address.port}`}
  }

  function healthAnswering(id: string): Parameters<typeof createServer>[1] {
    return (_request, response) => {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ok: true, id}))
    }
  }

  it('registers, lists and retires engines by id', () => {
    const home = freshHome()
    withHomeDb(home, (db) => {
      registerEngine(db, {id: 'a', pid: 7, root: '/r', apiBase: 'http://127.0.0.1:1/t/x'})
      registerEngine(db, {id: 'b', pid: 7, root: '/r', apiBase: 'http://127.0.0.1:2/t/y'})
      expect(
        listEngines(db)
          .map((row) => row.id)
          .toSorted(),
      ).toEqual(['a', 'b'])
      retireEngine(db, 'a', 123)
      expect(listEngines(db).map((row) => row.id)).toEqual(['b'])
      expect(db.select().from(engines).where(eq(engines.id, 'a')).get()?.deletedAt).toBe(123)
    })
  })

  it('checkEngines keeps a live engine, retires a refused port and a wrong id, reports a silent one', async () => {
    const home = freshHome()
    const live = await listen(healthAnswering('live'))
    const imposter = await listen(healthAnswering('someone-else'))
    const silent = await listen(() => {})
    const closed = await listen(healthAnswering('closed'))
    closed.server.close()
    await once(closed.server, 'close')
    const root = tempDir('conciv-root-')
    const silentRoot = tempDir('conciv-silent-root-')
    withHomeDb(home, (db) => {
      registerEngine(db, {id: 'live', pid: process.pid, root, apiBase: `${live.origin}/t/token`})
      registerEngine(db, {id: 'imposter', pid: process.pid, root, apiBase: `${imposter.origin}/t/token`})
      registerEngine(db, {id: 'silent', pid: process.pid, root: silentRoot, apiBase: `${silent.origin}/t/token`})
      registerEngine(db, {id: 'closed', pid: process.pid, root, apiBase: `${closed.origin}/t/token`})
    })
    const listedIds = () =>
      withHomeDb(home, (db) =>
        listEngines(db)
          .map((row) => row.id)
          .toSorted(),
      )
    try {
      const answered = await checkEngines(home, {timeoutMs: 10_000, roots: [root]})
      expect(answered.live.map((row) => row.id)).toEqual(['live'])
      expect(answered.unreachable).toEqual([])
      expect(listedIds()).toEqual(['live', 'silent'])
      const unanswered = await checkEngines(home, {timeoutMs: 300, roots: [silentRoot]})
      expect(unanswered.live).toEqual([])
      expect(unanswered.unreachable.map((row) => row.root)).toEqual([silentRoot])
      expect(listedIds()).toEqual(['live', 'silent'])
    } finally {
      for (const {server} of [live, imposter, silent]) {
        server.closeAllConnections()
        server.close()
      }
    }
  })

  it('records hub connections once per harness and removes one harness on disconnect', () => {
    const home = freshHome()
    withHomeDb(home, (db) => {
      recordHubConnection(db, 'codex', 1)
      recordHubConnection(db, 'codex', 2)
      recordHubConnection(db, 'claude', 3)
      expect(hubConnections(db)).toEqual([
        {harness: 'claude', connectedAt: 3},
        {harness: 'codex', connectedAt: 1},
      ])
      expect(lastHubRevocation(db)).toBe(0)
      removeHubConnection(db, 'codex')
      expect(hubConnections(db)).toEqual([{harness: 'claude', connectedAt: 3}])
      expect(lastHubRevocation(db)).toBe(1)
      const startedBetween = lastHubRevocation(db)
      removeHubConnection(db, 'claude')
      expect(lastHubRevocation(db)).toBe(2)
      expect(recordHubConnection(db, 'codex', 5, 0)).toBe(false)
      expect(recordHubConnection(db, 'codex', 5, startedBetween)).toBe(false)
      expect(recordHubConnection(db, 'codex', 5, lastHubRevocation(db))).toBe(true)
      expect(hubConnections(db)).toEqual([{harness: 'codex', connectedAt: 5}])
    })
  })

  it('leases one harness config change at a time, takes over a stale lease, and ends only its own', () => {
    const home = freshHome()
    withHomeDb(home, (db) => {
      const first = {harness: 'claude', pid: 1, childPid: null, startedAt: 10}
      const second = {harness: 'claude', pid: 2, childPid: null, startedAt: 20}
      expect(takeHubOperation(db, first, () => false)).toBe(true)
      expect(takeHubOperation(db, second, () => false)).toBe(false)
      expect(takeHubOperation(db, {harness: 'codex', pid: 2, childPid: null, startedAt: 20}, () => false)).toBe(true)
      expect(takeHubOperation(db, second, (held) => held.pid === 1)).toBe(true)
      endHubOperation(db, first)
      expect(takeHubOperation(db, first, () => false)).toBe(false)
      endHubOperation(db, second)
      expect(takeHubOperation(db, first, () => false)).toBe(true)
    })
  })

  it('takes a lease in one immediate transaction, so another writer between its read and its write never breaks it', () => {
    const home = freshHome()
    withHomeDb(home, (db) => {
      const other = new DatabaseSync(join(home, 'home.db'), {timeout: 0})
      const raced: string[] = []
      expect(takeHubOperation(db, {harness: 'claude', pid: 1, childPid: null, startedAt: 10}, () => false)).toBe(true)
      const taken = takeHubOperation(db, {harness: 'claude', pid: 2, childPid: null, startedAt: 20}, () => {
        try {
          other.exec('INSERT INTO hub_revocations DEFAULT VALUES')
          raced.push('written')
        } catch {
          raced.push('waited')
        }
        return true
      })
      other.close()
      expect({taken, raced}).toEqual({taken: true, raced: ['waited']})
    })
  })

  it('reads the home db only when it exists, so a lookup never creates the home folder', () => {
    const home = join(freshHome(), 'not-yet')
    expect(readHomeDb(home, hubConnections)).toBeNull()
    expect(existsSync(home)).toBe(false)
    withHomeDb(home, (db) => recordHubConnection(db, 'codex', 1))
    expect(readHomeDb(home, hubConnections)).toEqual([{harness: 'codex', connectedAt: 1}])
  })

  it('a connection opened while another is mid-migration waits and succeeds', async () => {
    const home = freshHome()
    mkdirSync(home, {recursive: true})
    const migrator = new Worker(
      `
      const {createRequire} = require('node:module')
      const {DatabaseSync} = require('node:sqlite')
      const {parentPort, workerData} = require('node:worker_threads')
      const packageRequire = createRequire(workerData.packageJson)
      const {drizzle} = packageRequire('drizzle-orm/node-sqlite')
      const {migrateSync} = packageRequire('drizzle-orm/sqlite-core/async/session')
      const lock = new DatabaseSync(workerData.lock, {timeout: 5000})
      lock.exec('BEGIN EXCLUSIVE')
      const client = new DatabaseSync(workerData.file, {timeout: 5000})
      client.exec('PRAGMA journal_mode = WAL')
      const logger = {
        logQuery(query) {
          if (!query.startsWith('INSERT INTO')) return
          parentPort.postMessage('migrating')
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400)
        },
      }
      migrateSync(workerData.migrations, drizzle({client, logger})._.session)
      client.close()
      lock.close()
      `,
      {
        eval: true,
        workerData: {
          packageJson: packageJsonPath,
          file: join(home, 'home.db'),
          lock: join(home, 'home.lock'),
          migrations: homeMigrations,
        },
      },
    )
    const signal = AbortSignal.timeout(10_000)
    const openWhileMigrating = async () => {
      await once(migrator, 'message', {signal})
      const first = openHomeDb(home)
      const second = openHomeDb(home)
      expect(listEngines(first)).toEqual([])
      expect(listEngines(second)).toEqual([])
      closeHomeDb(first)
      closeHomeDb(second)
    }
    try {
      await Promise.all([openWhileMigrating(), once(migrator, 'exit', {signal})])
    } finally {
      await migrator.terminate()
    }
  })

  it('two connections opening a fresh db at the same instant both succeed', async () => {
    const opened = await openTwiceAtOnce((folder) => ({module: homeDbModule, open: 'openHomeDb', folder}))
    expect(opened).toEqual(Array.from({length: 16}, () => ({migrations: homeMigrations.length})))
  })

  it.skipIf(process.platform === 'win32')('creates the folder 0700 and home.db 0600', () => {
    const home = freshHome()
    closeHomeDb(openHomeDb(home))
    expect(statSync(home).mode & 0o777).toBe(0o700)
    expect(statSync(join(home, 'home.db')).mode & 0o777).toBe(0o600)
  })

  it('refuses a symlinked home folder', () => {
    const target = freshHome()
    mkdirSync(target, {recursive: true})
    const link = join(tempDir('conciv-home-link-'), 'home')
    symlinkSync(target, link)
    const refusal = captureThrow(() => openHomeDb(link))
    expect(isHomeFolderRefused(refusal)).toBe(true)
    expect(String(refusal)).toContain(link)
  })

  it('concivHome prefers homeDir, then CONCIV_HOME, then the platform folder', () => {
    expect(concivHome({homeDir: '/explicit', env: {CONCIV_HOME: '/from-env'}})).toBe('/explicit')
    expect(concivHome({env: {CONCIV_HOME: '/from-env'}})).toBe('/from-env')
    expect(concivHome({env: {}})).toBe(envPaths('conciv', {suffix: ''}).data)
    expect(concivHome({env: {CONCIV_HOME: ''}})).toBe(envPaths('conciv', {suffix: ''}).data)
  })

  function captureThrow(run: () => unknown): unknown {
    try {
      run()
    } catch (error) {
      return error
    }
    throw new Error('expected a throw')
  }
})

async function openInWorker(
  opener: {module: string; open: string; folder: string; effect?: string},
  barrier: SharedArrayBuffer,
): Promise<unknown> {
  const worker = new Worker(
    `
    const {existsSync} = require('node:fs')
    const {registerHooks} = require('node:module')
    const {fileURLToPath} = require('node:url')
    const {parentPort, workerData} = require('node:worker_threads')
    registerHooks({
      resolve(specifier, context, next) {
        const source = context.parentURL && specifier.startsWith('.') && new URL(specifier.replace(/\\.js$/, '.ts'), context.parentURL)
        if (source && existsSync(fileURLToPath(source))) return next(source.href, context)
        return next(specifier, context)
      },
    })
    const gate = new Int32Array(workerData.barrier)
    import(workerData.module).then(async (module) => {
      Atomics.add(gate, 0, 1)
      Atomics.notify(gate, 0)
      for (let seen = Atomics.load(gate, 0); seen < 2; seen = Atomics.load(gate, 0)) Atomics.wait(gate, 0, seen)
      try {
        if (workerData.effect) {
          const {Effect} = await import(workerData.effect)
          const counted = await Effect.runPromise(
            Effect.scoped(
              Effect.flatMap(module[workerData.open](workerData.folder), (db) =>
                db.$client.unsafe('SELECT count(*) AS count FROM __drizzle_migrations'),
              ),
            ),
          )
          parentPort.postMessage({migrations: counted[0].count})
          return
        }
        const db = module[workerData.open](workerData.folder)
        parentPort.postMessage({migrations: db.$client.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get().count})
        db.$client.close()
      } catch (error) {
        parentPort.postMessage({error: String(error)})
      }
    })
    `,
    {eval: true, workerData: {...opener, barrier}},
  )
  const signal = AbortSignal.timeout(10_000)
  try {
    const [[message]] = await Promise.all([once(worker, 'message', {signal}), once(worker, 'exit', {signal})])
    return message
  } finally {
    await worker.terminate()
  }
}

async function openTwiceAtOnce(
  opener: (folder: string) => {module: string; open: string; folder: string; effect?: string},
): Promise<unknown[]> {
  const rounds = await Promise.all(
    Array.from({length: 8}, async () => {
      const target = opener(join(tempDir('conciv-race-'), 'state'))
      const barrier = new SharedArrayBuffer(4)
      return Promise.all([openInWorker(target, barrier), openInWorker(target, barrier)])
    }),
  )
  return rounds.flat()
}
