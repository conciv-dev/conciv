import * as Y from 'yjs'
import type {OrderedExcalidrawElement} from '@excalidraw/excalidraw/element/types'
import type {CaptureUpdateActionType} from '@excalidraw/excalidraw/store'
import {ELEMENTS_KEY, ORIGIN} from '../room.js'
import type {IslandHandle} from './island-types.js'

export type SceneElement = OrderedExcalidrawElement

const CAPTURE_NEVER: CaptureUpdateActionType = 'NEVER'

export function bindScene(opts: {
  doc: Y.Doc
  handle: IslandHandle
  onLocalElements: (apply: (next: readonly SceneElement[]) => void) => void
}): () => void {
  const elements = opts.doc.getMap<SceneElement>(ELEMENTS_KEY)
  const guard = {applyingRemote: false}

  const applyRemote = (): void => {
    guard.applyingRemote = true
    opts.handle.updateScene({elements: [...elements.values()], captureUpdate: CAPTURE_NEVER})
    guard.applyingRemote = false
  }

  const writeLocal = (next: readonly SceneElement[]): void => {
    if (guard.applyingRemote) return
    const nextIds = new Set(next.map((el) => el.id))
    const stale = [...elements.keys()].filter((id) => !nextIds.has(id))
    const changed = next.filter((el) => elements.get(el.id)?.version !== el.version)
    if (!changed.length && !stale.length) return
    opts.doc.transact(() => {
      changed.forEach((el) => elements.set(el.id, el))
      stale.forEach((id) => elements.delete(id))
    }, ORIGIN.USER)
  }

  const observer = (_event: Y.YMapEvent<SceneElement>, txn: Y.Transaction): void => {
    if (txn.origin === ORIGIN.USER) return
    applyRemote()
  }

  elements.observe(observer)
  opts.onLocalElements(writeLocal)
  return () => elements.unobserve(observer)
}
