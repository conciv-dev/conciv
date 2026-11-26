import {and, eq} from 'drizzle-orm'
import {Effect, Layer} from 'effect'
import * as Database from '@conciv/backend-app-api/core/database/database'
import * as Bus from '@conciv/backend-app-api/core/bus'
import {TabTable} from '@conciv/backend-app-api/core/tab/sql'
import * as SessionEvent from '@conciv/protocol/schema/session-event'
import * as BrowserTabEvent from '@conciv/protocol/schema/browser-tab-event'

type State = {readonly url: string; readonly title: string; readonly focused: boolean; readonly visible: boolean}

function readState(tab: State, created: number) {
  return {
    url: tab.url,
    title: tab.title,
    visible: tab.visible,
    updated_at: created,
    ...(tab.focused ? {focused_at: created} : {}),
  }
}

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    const db = (yield* Database.Service).db
    yield* bus.project(BrowserTabEvent.Opened, (event) => {
      const row = {
        session_id: event.data.sessionID,
        connection_id: event.data.connectionId,
        open: true,
        ...readState(event.data.tab, event.created),
      }
      return db
        .insert(TabTable)
        .values({id: event.data.tabId, ...row})
        .onConflictDoUpdate({target: TabTable.id, set: row})
        .run()
        .pipe(Effect.orDie)
    })
    yield* bus.project(BrowserTabEvent.Updated, (event) =>
      db
        .update(TabTable)
        .set(readState(event.data.tab, event.created))
        .where(and(eq(TabTable.id, event.data.tabId), eq(TabTable.session_id, event.data.sessionID)))
        .run()
        .pipe(Effect.orDie),
    )
    yield* bus.project(BrowserTabEvent.Closed, (event) =>
      db
        .update(TabTable)
        .set({open: false, updated_at: event.created})
        .where(and(eq(TabTable.id, event.data.tabId), eq(TabTable.connection_id, event.data.connectionId)))
        .run()
        .pipe(Effect.orDie),
    )
    yield* bus.project(SessionEvent.Deleted, (event) =>
      db.delete(TabTable).where(eq(TabTable.session_id, event.data.sessionID)).run().pipe(Effect.orDie),
    )
  }),
)
