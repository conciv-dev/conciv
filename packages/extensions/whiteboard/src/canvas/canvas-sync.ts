import type {Doc} from 'yjs'
import type {CaptureUpdateActionType} from '@excalidraw/excalidraw/store'
import {ELEMENTS_KEY} from '../room.js'
import {bindScene, type SceneElement} from './glue.js'
import type {IslandHandle} from './island-types.js'

const CAPTURE_NEVER: CaptureUpdateActionType = 'NEVER'

export function bindCanvasSync(opts: {
  doc: Doc
  handle: IslandHandle
  onUserChange: (writer: (next: readonly SceneElement[]) => void) => void
}): () => void {
  // Always set the scene (even empty) so re-binding to a different session's room clears the previous
  // session's elements rather than leaving them on the canvas.
  const seed = [...opts.doc.getMap<SceneElement>(ELEMENTS_KEY).values()]
  opts.handle.updateScene({elements: seed, captureUpdate: CAPTURE_NEVER})
  return bindScene({doc: opts.doc, handle: opts.handle, onLocalElements: opts.onUserChange})
}
