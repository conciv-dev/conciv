import {and, desc, eq} from 'drizzle-orm'
import {Deferred, Effect, HashMap, Layer, Option, Ref, Semaphore, Stream, SubscriptionRef} from 'effect'
import type {SessionId} from '@conciv/types/chat-types'
import type {BrowserTab, BrowserTabOpen} from '@conciv/protocol/schema/browser-tab'
import * as SessionEvent from '@conciv/protocol/schema/session-event'
import * as BrowserTabEvent from '@conciv/protocol/schema/browser-tab-event'
import * as Bus from '@conciv/backend-app-api/core/bus'
import * as Database from '@conciv/backend-app-api/core/database/database'
import * as Location from '@conciv/backend-app-api/core/location'
import * as Session from '@conciv/backend-app-api/core/session'
import {makeUnavailableError, Service, type Outcome} from '@conciv/backend-app-api/core/tab'
import {TabTable} from '@conciv/backend-app-api/core/tab/sql'

type Live = {
  readonly sessionId: SessionId
  readonly connectionId: string
  readonly closed: Deferred.Deferred<Outcome>
}

type Row = typeof TabTable.$inferSelect

function readTab(row: Row, focusedTabId: string | null): BrowserTab {
  return {id: row.id, url: row.url, title: row.title, focused: row.id === focusedTabId, visible: row.visible}
}

function byLastFocused(left: Row, right: Row) {
  return (right.focused_at ?? -1) - (left.focused_at ?? -1)
}

function isOwner(entry: Option.Option<Live>, input: BrowserTabOpen) {
  return (
    Option.isSome(entry) && entry.value.sessionId === input.sessionId && entry.value.connectionId === input.connectionId
  )
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    const db = (yield* Database.Service).db
    const location = yield* Location.Service
    const sessions = yield* Session.Service
    const lock = yield* Semaphore.make(1)
    const live = yield* Ref.make(HashMap.empty<string, Live>())
    const version = yield* SubscriptionRef.make(0)

    const close = (tabId: string, entry: Pick<Live, 'sessionId' | 'connectionId'>) =>
      bus.publish(BrowserTabEvent.Closed, {sessionID: entry.sessionId, tabId, connectionId: entry.connectionId})

    const stale = yield* db
      .select({id: TabTable.id, sessionId: TabTable.session_id, connectionId: TabTable.connection_id})
      .from(TabTable)
      .where(eq(TabTable.open, true))
      .all()
      .pipe(Effect.orDie)
    yield* Effect.forEach(stale, (row) => close(row.id, row), {discard: true})

    const closeSession = (sessionId: SessionId) =>
      lock.withPermit(
        Effect.gen(function* () {
          const owned = HashMap.filter(yield* Ref.get(live), (entry) => entry.sessionId === sessionId)
          yield* Ref.update(
            live,
            HashMap.filter((entry) => entry.sessionId !== sessionId),
          )
          yield* Effect.forEach(HashMap.values(owned), (entry) => Deferred.succeed(entry.closed, 'closed'), {
            discard: true,
          })
        }),
      )

    yield* bus.subscribe(SessionEvent.Deleted).pipe(
      Stream.runForEach((event) => closeSession(event.data.sessionID)),
      Effect.forkScoped({startImmediately: true}),
    )

    yield* bus
      .subscribe([BrowserTabEvent.Opened, BrowserTabEvent.Updated, BrowserTabEvent.Closed, SessionEvent.Deleted])
      .pipe(
        Stream.runForEach(() => SubscriptionRef.update(version, (current) => current + 1)),
        Effect.forkScoped({startImmediately: true}),
      )

    yield* Effect.addFinalizer(() =>
      lock.withPermit(
        Effect.gen(function* () {
          const entries = yield* Ref.getAndSet(live, HashMap.empty())
          yield* Effect.forEach(
            entries,
            ([tabId, entry]) =>
              close(tabId, entry).pipe(
                Effect.catchCause((cause) => Effect.logWarning(`Browser tab ${tabId} could not be closed`, cause)),
                Effect.andThen(Deferred.succeed(entry.closed, 'closed')),
              ),
            {discard: true},
          )
        }),
      ),
    )

    return Service.of({
      open: Effect.fn('Tab.open')(function* (input) {
        const session = yield* sessions.get(input.sessionId)
        if (session.location.directory !== location.directory)
          return yield* Effect.fail(makeUnavailableError('Session belongs to another location.'))
        const entry: Live = {
          sessionId: input.sessionId,
          connectionId: input.connectionId,
          closed: yield* Deferred.make<Outcome>(),
        }
        yield* Effect.acquireRelease(
          lock.withPermit(
            Effect.gen(function* () {
              const previous = HashMap.get(yield* Ref.get(live), input.tab.id)
              yield* Ref.update(live, HashMap.set(input.tab.id, entry))
              yield* bus.publish(BrowserTabEvent.Opened, {
                sessionID: input.sessionId,
                tabId: input.tab.id,
                connectionId: input.connectionId,
                tab: input.tab,
              })
              if (Option.isSome(previous)) yield* Deferred.succeed(previous.value.closed, 'replaced')
            }),
          ),
          () =>
            lock.withPermit(
              Effect.gen(function* () {
                const current = HashMap.get(yield* Ref.get(live), input.tab.id)
                if (Option.isNone(current) || current.value !== entry) return
                yield* Ref.update(live, HashMap.remove(input.tab.id))
                yield* close(input.tab.id, entry)
              }),
            ),
        )
        return yield* Deferred.await(entry.closed)
      }),
      update: Effect.fn('Tab.update')(function* (input) {
        yield* lock.withPermit(
          Effect.gen(function* () {
            if (!isOwner(HashMap.get(yield* Ref.get(live), input.tab.id), input))
              return yield* Effect.fail(makeUnavailableError('The browser tab is not open on this engine.'))
            yield* bus.publish(BrowserTabEvent.Updated, {
              sessionID: input.sessionId,
              tabId: input.tab.id,
              tab: input.tab,
            })
          }),
        )
      }),
      list: Effect.fn('Tab.list')(function* (sessionId) {
        const rows = yield* db
          .select()
          .from(TabTable)
          .where(and(eq(TabTable.session_id, sessionId), eq(TabTable.open, true)))
          .orderBy(desc(TabTable.updated_at))
          .all()
          .pipe(Effect.orDie)
        const ordered = rows.toSorted(byLastFocused)
        const first = ordered[0]
        const focusedTabId = first === undefined || first.focused_at === null ? null : first.id
        return {tabs: ordered.map((row) => readTab(row, focusedTabId)), focusedTabId}
      }),
      sessions: Effect.fn('Tab.sessions')(function* () {
        const rows = yield* db
          .selectDistinct({sessionId: TabTable.session_id})
          .from(TabTable)
          .where(eq(TabTable.open, true))
          .all()
          .pipe(Effect.orDie)
        return rows.map((row) => row.sessionId)
      }),
      changes: SubscriptionRef.changes(version).pipe(Stream.map((current) => ({version: current}))),
    })
  }),
)
