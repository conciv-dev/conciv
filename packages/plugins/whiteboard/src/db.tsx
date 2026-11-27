import {createContext, onCleanup, untrack, useContext, type JSX} from 'solid-js'
import type {Context} from '@conciv/frontend-plugin-api'
import {createWhiteboardDb, type WhiteboardDb} from './whiteboard-db.js'
import {useWhiteboardRuntime} from './solid-runtime.js'
import {canvasErrors} from './errors/canvas-errors.js'

const WhiteboardDbContext = createContext<WhiteboardDb>()

export function WhiteboardDbProvider(props: {
  client: Context['client']
  room: string
  catchUpRetryMs: number
  children: JSX.Element
}): JSX.Element {
  const runtime = useWhiteboardRuntime()
  const db = untrack(() => createWhiteboardDb(runtime, props.client, props.room, props.catchUpRetryMs))
  onCleanup(() => db.dispose())
  return <WhiteboardDbContext.Provider value={db}>{props.children}</WhiteboardDbContext.Provider>
}

export function useWhiteboardDb(): WhiteboardDb {
  const db = useContext(WhiteboardDbContext)
  if (!db) throw canvasErrors.DB_MISSING()
  return db
}
