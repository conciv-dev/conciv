import * as Y from 'yjs'
import {describe, expect, it} from 'vitest'
import {bindScene} from '../src/canvas/glue.js'
import {ELEMENTS_KEY, ORIGIN} from '../src/room.js'

const fakeHandle = () => {
  const scenes: unknown[] = []
  return {
    scenes,
    updateScene: (d: {elements?: unknown[]}) => void scenes.push(d.elements),
    getSceneElements: () => [],
    updateCollaborators: () => {},
    destroy: () => {},
  }
}

describe('glue', () => {
  it('applies a remote element into the scene with captureUpdate NEVER', () => {
    const doc = new Y.Doc()
    const handle = fakeHandle()
    bindScene({doc, handle: handle as never, onLocalElements: () => {}})
    doc.transact(() => doc.getMap(ELEMENTS_KEY).set('e1', {id: 'e1', version: 1}), ORIGIN.AI)
    expect(handle.scenes.at(-1)).toEqual([{id: 'e1', version: 1}])
  })

  it('writes a user-added element into the Yjs map under USER origin without echoing', () => {
    const doc = new Y.Doc()
    const handle = fakeHandle()
    let userChange: (e: readonly {id: string; version: number}[]) => void = () => {}
    bindScene({doc, handle: handle as never, onLocalElements: (apply) => void (userChange = apply as never)})
    userChange([{id: 'u1', version: 1}])
    expect(doc.getMap(ELEMENTS_KEY).get('u1')).toEqual({id: 'u1', version: 1})
    expect(handle.scenes.length).toBe(0)
  })

  it('captures the NEVER action on the remote apply', () => {
    const doc = new Y.Doc()
    const captures: unknown[] = []
    const handle = {
      updateScene: (d: {captureUpdate?: unknown}) => void captures.push(d.captureUpdate),
      getSceneElements: () => [],
      updateCollaborators: () => {},
      destroy: () => {},
    }
    bindScene({doc, handle: handle as never, onLocalElements: () => {}})
    doc.transact(() => doc.getMap(ELEMENTS_KEY).set('e1', {id: 'e1', version: 1}), ORIGIN.AI)
    expect(captures.at(-1)).toBe('NEVER')
  })
})
