import {and, asc, eq, inArray, isNull} from 'drizzle-orm'
import {Duration, Effect, Fiber, Semaphore, Stream} from 'effect'
import type {SessionId} from '@conciv/protocol/schema/session-id'
import type {Maker} from '@conciv/protocol/schema/identifier'
import type * as Bus from '@conciv/backend-app-api/core/bus'
import type * as Database from '@conciv/backend-app-api/core/database/database'
import {OutsideNoticeTable} from '@conciv/backend-app-api/core/session/sql'
import * as SessionEvent from '@conciv/protocol/schema/session-event'

type Call = {readonly sessionId: SessionId; readonly toolCallId: string}

type Collect = {readonly sessionId: SessionId; readonly toolCallIds?: readonly string[]; readonly waitMs: number}

type Row = typeof OutsideNoticeTable.$inferSelect

export const make = Effect.fn('OutsideNotice.make')(function* (
  bus: Bus.Interface,
  db: Database.Interface['db'],
  ids: Maker,
) {
  const lock = yield* Semaphore.make(1)

  const owed = (sessionId: SessionId, toolCallIds: readonly string[] | undefined) =>
    db
      .select()
      .from(OutsideNoticeTable)
      .where(
        and(
          eq(OutsideNoticeTable.session_id, sessionId),
          eq(OutsideNoticeTable.delivered, false),
          ...(toolCallIds === undefined ? [] : [inArray(OutsideNoticeTable.tool_call_id, [...toolCallIds])]),
        ),
      )
      .orderBy(asc(OutsideNoticeTable.created_at), asc(OutsideNoticeTable.id))
      .all()
      .pipe(Effect.orDie)

  const take = (input: Collect) =>
    lock.withPermit(
      Effect.gen(function* () {
        const rows = yield* owed(input.sessionId, input.toolCallIds)
        const ready = rows.flatMap((row: Row) =>
          row.text === null ? [] : [{id: row.id, toolCallId: row.tool_call_id, text: row.text}],
        )
        if (ready.length > 0)
          yield* bus.publish(SessionEvent.OutsideDelivered, {
            sessionID: input.sessionId,
            ids: ready.map((notice) => notice.id),
          })
        return {notices: ready, pending: rows.filter((row) => row.text === null).map((row) => row.tool_call_id)}
      }),
    )

  return {
    expect: Effect.fn('OutsideNotice.expect')(function* (input: Call) {
      yield* bus.publish(SessionEvent.OutsideExpected, {
        sessionID: input.sessionId,
        id: 'ntc_' + ids.ascending(),
        toolCallId: input.toolCallId,
      })
    }),
    notify: Effect.fn('OutsideNotice.notify')(function* (input: Call & {readonly text: string}) {
      yield* lock.withPermit(
        Effect.gen(function* () {
          const expected = yield* db
            .select({id: OutsideNoticeTable.id})
            .from(OutsideNoticeTable)
            .where(
              and(
                eq(OutsideNoticeTable.session_id, input.sessionId),
                eq(OutsideNoticeTable.tool_call_id, input.toolCallId),
                isNull(OutsideNoticeTable.text),
              ),
            )
            .orderBy(asc(OutsideNoticeTable.created_at))
            .get()
            .pipe(Effect.orDie)
          yield* bus.publish(SessionEvent.OutsideNotice, {
            sessionID: input.sessionId,
            id: expected?.id ?? 'ntc_' + ids.ascending(),
            toolCallId: input.toolCallId,
            text: input.text,
          })
        }),
      )
    }),
    collect: Effect.fn('OutsideNotice.collect')(function* (input: Collect) {
      const called = input.toolCallIds
      if (called === undefined || input.waitMs === 0) return yield* take(input)
      const arrived = yield* bus.subscribe(SessionEvent.OutsideNotice).pipe(
        Stream.filter((event) => event.data.sessionID === input.sessionId && called.includes(event.data.toolCallId)),
        Stream.runHead,
        Effect.forkScoped({startImmediately: true}),
      )
      const first = yield* take(input)
      if (first.notices.length > 0 || first.pending.length === 0) return first
      yield* Fiber.join(arrived).pipe(Effect.timeoutOption(Duration.millis(input.waitMs)))
      return yield* take(input)
    }, Effect.scoped),
  }
})
