import {createContext, onCleanup, untrack, useContext, type JSX} from 'solid-js'
import type {Context} from '@conciv/plugin/experimental'
import {createWhiteboardDb, type WhiteboardDb} from './whiteboard-db.js'

const WhiteboardDbContext = createContext<WhiteboardDb>()

export function WhiteboardDbProvider(props: {
  client: Context['client']
  room: string
  catchUpRetryMs: number
  children: JSX.Element
}): JSX.Element {
  const db = untrack(() => createWhiteboardDb(props.client, props.room, props.catchUpRetryMs))
  onCleanup(() => db.dispose())
  return <WhiteboardDbContext.Provider value={db}>{props.children}</WhiteboardDbContext.Provider>
}

export function useWhiteboardDb(): WhiteboardDb {
  const db = useContext(WhiteboardDbContext)
  if (!db) throw new Error('useWhiteboardDb must be used inside a WhiteboardDbProvider')
  return db
}
