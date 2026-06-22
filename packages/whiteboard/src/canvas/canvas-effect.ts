import {onCleanup, onMount, type JSX} from 'solid-js'
import {defineEffect, type EffectCtx} from '@mandarax/extensions'
import {roomId} from '../room.js'
import type {SceneElement} from './glue.js'
import type {IslandHandle} from './island-types.js'

export const canvasEffect = defineEffect({
  name: 'whiteboard',
  label: 'Whiteboard',
  description: 'The whiteboard canvas overlay.',
  render: (ctx: EffectCtx): JSX.Element => {
    const host = document.createElement('div')
    host.setAttribute('data-whiteboard-canvas', '')
    host.style.position = 'fixed'
    host.style.inset = '0'
    let handle: IslandHandle | undefined
    let disposeSync: (() => void) | undefined
    let disposeAi: (() => void) | undefined
    let disposePresence: (() => void) | undefined
    onMount(async () => {
      const root = host.getRootNode()
      const [island, sheet] = await Promise.all([
        import('./island.js'),
        import('@excalidraw/excalidraw/index.css?inline'),
      ])
      if (root instanceof ShadowRoot && !root.querySelector('[data-whiteboard-style]')) {
        const style = document.createElement('style')
        style.setAttribute('data-whiteboard-style', '')
        style.textContent = sheet.default
        root.appendChild(style)
      }
      const [{bindCanvasSync}, {bindAiDraws}, {bindPresence}] = await Promise.all([
        import('./canvas-sync.js'),
        import('./ai-draws.js'),
        import('./presence.js'),
      ])
      const room = ctx.sync.room(roomId(ctx.previewId, ctx.sessionId() ?? ''))
      let writer: (next: readonly SceneElement[]) => void = () => {}
      let pointer: (p: {x: number; y: number}) => void = () => {}
      handle = island.mountIsland({
        container: host,
        initialElements: [],
        onUserChange: (elements) => writer(elements),
        onPointer: (p) => pointer(p),
        theme: 'light',
      })
      disposeSync = bindCanvasSync({
        doc: room.doc,
        handle,
        onUserChange: (register) => void (writer = register),
      })
      disposeAi = bindAiDraws(room.doc)
      const presence = bindPresence({awareness: room.awareness, handle, self: selfIdentity()})
      pointer = (p) => presence.setCursor(p.x, p.y)
      disposePresence = presence.dispose
    })
    onCleanup(() => {
      disposePresence?.()
      disposeAi?.()
      disposeSync?.()
      handle?.destroy()
    })
    return host
  },
})

const PALETTE = [
  {background: '#ffc9c9', stroke: '#e03131'},
  {background: '#b2f2bb', stroke: '#2f9e44'},
  {background: '#a5d8ff', stroke: '#1971c2'},
  {background: '#ffec99', stroke: '#f08c00'},
]

function selfIdentity(): {id: string; name: string; color: {background: string; stroke: string}} {
  const id = crypto.randomUUID()
  return {id, name: `Guest ${id.slice(0, 4)}`, color: PALETTE[Math.floor(Math.random() * PALETTE.length)]!}
}
