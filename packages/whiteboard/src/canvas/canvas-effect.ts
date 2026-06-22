import {onCleanup, onMount, type JSX} from 'solid-js'
import {defineEffect, type EffectCtx} from '@mandarax/extensions'
import {roomId} from '../room.js'
import {mountZoomControls} from './zoom-controls.js'
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
    let disposeControls: (() => void) | undefined
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
      const {bindCanvasSync} = await import('./canvas-sync.js')
      const room = ctx.sync.room(roomId(ctx.previewId, ctx.sessionId() ?? ''))
      let writer: (next: readonly SceneElement[]) => void = () => {}
      handle = island.mountIsland({
        container: host,
        initialElements: [],
        onUserChange: (elements) => writer(elements),
        onPointer: () => {},
        theme: 'light',
      })
      disposeSync = bindCanvasSync({
        doc: room.doc,
        handle,
        onUserChange: (register) => void (writer = register),
      })
      const controls = mountZoomControls({handle, reducedMotion: ctx.env.reducedMotion})
      host.appendChild(controls.el)
      disposeControls = controls.dispose
    })
    onCleanup(() => {
      disposeControls?.()
      disposeSync?.()
      handle?.destroy()
    })
    return host
  },
})
