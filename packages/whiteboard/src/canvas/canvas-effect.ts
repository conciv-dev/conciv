import {createEffect, getOwner, onCleanup, onMount, runWithOwner, type JSX} from 'solid-js'
import {defineEffect, type EffectCtx} from '@mandarax/extensions'
import {roomId} from '../room.js'
import type {SceneElement} from './glue.js'
import type {IslandHandle} from './island-types.js'

export const canvasEffect = defineEffect({
  name: 'whiteboard',
  label: 'Whiteboard',
  description: 'The whiteboard canvas overlay.',
  render: (ctx: EffectCtx): JSX.Element => {
    const marker = document.createElement('div')
    marker.setAttribute('data-whiteboard-marker', '')
    const owner = getOwner()
    let handle: IslandHandle | undefined
    let host: HTMLDivElement | undefined
    let pinsHost: HTMLDivElement | undefined
    let threadHost: HTMLDivElement | undefined
    let disposeThread: (() => void) | undefined
    onMount(async () => {
      const [island, sheet] = await Promise.all([
        import('./island.js'),
        import('@excalidraw/excalidraw/index.css?inline'),
      ])
      if (!document.head.querySelector('[data-whiteboard-style]')) {
        const style = document.createElement('style')
        style.setAttribute('data-whiteboard-style', '')
        style.textContent = sheet.default
        document.head.appendChild(style)
      }
      host = document.createElement('div')
      host.setAttribute('data-whiteboard-canvas', '')
      host.style.cssText = 'position:fixed;inset:0;z-index:2147482000'
      document.body.appendChild(host)
      pinsHost = document.createElement('div')
      pinsHost.setAttribute('data-whiteboard-pins', '')
      pinsHost.style.cssText = 'position:fixed;inset:0;z-index:2147482001;pointer-events:none'
      document.body.appendChild(pinsHost)
      const [{bindCanvasSync}, {bindAiDraws}, {bindPresence}, {mountPins}, {mountThread}] = await Promise.all([
        import('./canvas-sync.js'),
        import('./ai-draws.js'),
        import('./presence.js'),
        import('../pins/pins.js'),
        import('../pins/thread.js'),
      ])
      let writer: (next: readonly SceneElement[]) => void = () => {}
      let pointer: (p: {x: number; y: number}) => void = () => {}
      const activeHandle = island.mountIsland({
        container: host,
        initialElements: [],
        onUserChange: (elements) => writer(elements),
        onPointer: (p) => pointer(p),
        theme: 'light',
      })
      const activePinsHost = pinsHost
      handle = activeHandle
      const closeThread = (): void => {
        disposeThread?.()
        disposeThread = undefined
        threadHost?.remove()
        threadHost = undefined
      }
      const openThread = (cid: string): void => {
        closeThread()
        threadHost = document.createElement('div')
        threadHost.setAttribute('data-whiteboard-thread-host', '')
        threadHost.style.cssText = 'position:fixed;inset:0;z-index:2147482002;pointer-events:none'
        document.body.appendChild(threadHost)
        disposeThread = mountThread({
          container: threadHost,
          rootCid: cid,
          ctx: {apiBase: '', harnessId: '', sendMessage: () => {}},
          runTool: (name, input) => ctx.runTool(name, input),
          onClose: closeThread,
        })
      }
      // Re-bind the room whenever the active session changes: the canvas, pins, and presence follow
      // the widget's current session, clearing the previous session's scene + pins.
      runWithOwner(owner, () =>
        createEffect(() => {
          const room = ctx.sync.room(roomId(ctx.previewId, ctx.sessionId() ?? ''))
          const disposeSync = bindCanvasSync({
            doc: room.doc,
            handle: activeHandle,
            onUserChange: (r) => void (writer = r),
          })
          const disposeAi = bindAiDraws(room.doc)
          const presence = bindPresence({awareness: room.awareness, handle: activeHandle, self: selfIdentity()})
          pointer = (p) => presence.setCursor(p.x, p.y)
          const disposePins = mountPins({container: activePinsHost, doc: room.doc, onOpen: openThread})
          onCleanup(() => {
            closeThread()
            disposePins()
            presence.dispose()
            disposeAi()
            disposeSync()
          })
        }),
      )
    })
    onCleanup(() => {
      disposeThread?.()
      threadHost?.remove()
      pinsHost?.remove()
      handle?.destroy()
      host?.remove()
    })
    return marker
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
