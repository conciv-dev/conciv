import type {ClientRoom} from '@mandarax/protocol/sync-types'
import type {Collaborator, SocketId} from '@excalidraw/excalidraw/types'
import type {IslandHandle} from './island-types.js'

type Awareness = ClientRoom['awareness']

type Self = {id: string; name: string; color: {background: string; stroke: string}}

export function bindPresence(opts: {awareness: Awareness; handle: IslandHandle; self: Self}): {
  setCursor: (x: number, y: number) => void
  dispose: () => void
} {
  const {awareness, handle, self} = opts
  awareness.setLocalStateField('user', {id: self.id, name: self.name, color: self.color})

  const sync = (): void => {
    const collaborators = new Map<SocketId, Collaborator>()
    awareness.getStates().forEach((state, clientId) => {
      if (clientId === awareness.clientID || !state.user) return
      collaborators.set(String(clientId) as SocketId, {
        username: state.user.name,
        color: state.user.color,
        pointer: state.cursor ? {x: state.cursor.x, y: state.cursor.y, tool: 'pointer'} : undefined,
      })
    })
    handle.updateCollaborators(collaborators)
  }

  awareness.on('change', sync)
  sync()

  return {
    setCursor: (x, y) => awareness.setLocalStateField('cursor', {x, y}),
    dispose: () => {
      awareness.off('change', sync)
      awareness.setLocalState(null)
    },
  }
}
