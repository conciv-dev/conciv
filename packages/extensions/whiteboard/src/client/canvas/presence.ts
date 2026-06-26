import {createEffect, onCleanup} from 'solid-js'
import {useAll, useDb} from 'jazz-tools/solid'
import type {Collaborator, SocketId} from '@excalidraw/excalidraw/types'
import {app} from '../../shared/schema.js'
import type {IslandHandle} from '../../canvas/island-types.js'

export type Self = {sessionId: string; name: string; color: string}

const THROTTLE_MS = 50

export function useCursorPresence(opts: {
  handle: IslandHandle
  room: () => string
  self: Self
}): (x: number, y: number) => void {
  const db = useDb()
  const peers = useAll(() => ({query: app.cursors.where({room: opts.room()})}))

  createEffect(() => {
    const collaborators = new Map<SocketId, Collaborator>()
    ;(peers.data ?? [])
      .filter((cursor) => cursor.sessionId !== opts.self.sessionId)
      .forEach((cursor) =>
        collaborators.set(cursor.sessionId as SocketId, {
          username: cursor.name,
          color: {background: cursor.color, stroke: cursor.color},
          pointer: {x: cursor.x, y: cursor.y, tool: 'pointer'},
        }),
      )
    opts.handle.updateCollaborators(collaborators)
  })

  let rowId: string | undefined
  let last = 0
  onCleanup(() => {
    if (rowId) db().delete(app.cursors, rowId)
  })

  return (x: number, y: number): void => {
    const now = Date.now()
    if (now - last < THROTTLE_MS) return
    last = now
    if (!rowId) {
      rowId = db().insert(app.cursors, {
        room: opts.room(),
        sessionId: opts.self.sessionId,
        x,
        y,
        name: opts.self.name,
        color: opts.self.color,
      }).value.id
      return
    }
    db().update(app.cursors, rowId, {x, y})
  }
}
