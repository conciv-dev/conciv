import {eq} from 'drizzle-orm'
import {Effect, type ManagedRuntime} from 'effect'
import {MarkerId, type ChatPlane} from '@conciv/chat'
import {drafts, markers, SessionInboxTable, sessions, type ConcivDb} from '@conciv/db'
import {SessionId} from '@conciv/plugin/schema/session-id'
import {Bus, KV, SessionEvent, SessionSchema} from '@conciv/plugin-host'
import {runInOrder} from '../lib/shutdown.js'
import {removeInstructionEntries} from '../runtime/instruction-entries.js'
import {createRow, rowById, tombstoneRow, type FreshRowInput, type RowScope} from './session-rows.js'
import type {createSessionSearch} from './session-search.js'
import type {CoreRuntime} from '../runtime/scope-types.js'

type PluginHost = ManagedRuntime.ManagedRuntime<Bus.Interface | KV.Interface, never>

type SessionRenaming = {
  db: ConcivDb
  search: Pick<ReturnType<typeof createSessionSearch>, 'retitle'>
  pluginHost: PluginHost
}

type SessionDeletion = {
  db: ConcivDb
  plane: Pick<ChatPlane, 'clear' | 'endRuns'>
  runtime: Pick<CoreRuntime, 'forSession'>
  pluginHost: PluginHost
}

function chatRow(scope: RowScope, sessionId: SessionId): FreshRowInput {
  return {
    id: sessionId,
    harnessSessionId: null,
    harnessKind: scope.harnessKind,
    origin: 'chat',
    title: null,
    model: null,
    usage: null,
    cwd: scope.cwd,
    deletedAt: null,
  }
}

async function markNew(db: ConcivDb, sessionId: SessionId): Promise<void> {
  await Effect.runPromise(
    db.insert(markers).values({id: MarkerId.create(), sessionId, afterMessageId: null, kind: 'new'}),
  )
}

export async function createChatSession(
  scope: RowScope,
  sessionId: SessionId = SessionId.create(),
): Promise<{sessionId: SessionId}> {
  await createRow(scope, chatRow(scope, sessionId))
  await markNew(scope.db, sessionId)
  return {sessionId}
}

function cleanTitle(title: string): string {
  return title
    .replace(/\p{Cc}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

export async function renameSession(
  renaming: SessionRenaming,
  sessionId: SessionId,
  given: string,
): Promise<{title: string} | 'missing'> {
  const row = await rowById(renaming.db, sessionId)
  if (!row) return 'missing'
  const title = cleanTitle(given)
  await Effect.runPromise(
    renaming.db.update(sessions).set({title, updatedAt: Date.now()}).where(eq(sessions.id, sessionId)),
  )
  if (row.harnessSessionId !== null) await renaming.search.retitle(row.harnessKind, row.harnessSessionId, title)
  await renaming.pluginHost.runPromise(
    Bus.Service.use((bus) => bus.publish(SessionEvent.Renamed, {sessionID: SessionSchema.Id.make(sessionId), title})),
  )
  return {title}
}

const deletionFailed = 'conciv: deleting the session failed'

export async function deleteSession(deletion: SessionDeletion, sessionId: SessionId): Promise<void> {
  await deletion.runtime.forSession(sessionId).run.stop()
  await deletion.plane.endRuns(sessionId)
  await deletion.pluginHost.runPromise(KV.Service.use((kv) => removeInstructionEntries(kv, sessionId)))
  await tombstoneRow(deletion.db, sessionId)
  const draftFailures = await Effect.runPromise(
    Effect.all([
      deletion.db.delete(drafts).where(eq(drafts.sessionId, sessionId)),
      deletion.db.delete(SessionInboxTable).where(eq(SessionInboxTable.session_id, sessionId)),
    ]),
  ).then(
    (): unknown[] => [],
    (failure: unknown) => [failure],
  )
  const publishFailures = await deletion.pluginHost
    .runPromise(
      Bus.Service.use((bus) =>
        bus
          .publish(SessionEvent.Deleted, {sessionID: SessionSchema.Id.make(sessionId)})
          .pipe(Effect.andThen(bus.remove(sessionId))),
      ),
    )
    .then(
      (): unknown[] => [],
      (failure: unknown) => [failure],
    )
  const cleanupFailures = await runInOrder([() => deletion.plane.clear(sessionId)], deletionFailed).then(
    (): unknown[] => [],
    (cleanup: unknown): unknown[] => (cleanup instanceof AggregateError ? cleanup.errors : [cleanup]),
  )
  const failures = [...draftFailures, ...publishFailures, ...cleanupFailures]
  if (failures.length === 0) return
  const [onlyFailure] = failures
  if (failures.length === 1 && cleanupFailures.length === 0) throw onlyFailure
  throw new AggregateError(failures, deletionFailed)
}
