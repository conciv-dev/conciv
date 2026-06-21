import type {Collaborator, ExcalidrawImperativeAPI, SocketId} from '@excalidraw/excalidraw/types'
import type {ExcalidrawElement, OrderedExcalidrawElement} from '@excalidraw/excalidraw/element/types'

export type IslandHandle = {
  updateScene: ExcalidrawImperativeAPI['updateScene']
  getSceneElements: ExcalidrawImperativeAPI['getSceneElements']
  updateCollaborators: (m: Map<SocketId, Collaborator>) => void
  destroy: () => void
}

export type IslandOpts = {
  container: HTMLElement
  initialElements: readonly ExcalidrawElement[]
  onUserChange: (elements: readonly OrderedExcalidrawElement[]) => void
  onPointer: (p: {x: number; y: number}) => void
  theme: 'light' | 'dark'
}
