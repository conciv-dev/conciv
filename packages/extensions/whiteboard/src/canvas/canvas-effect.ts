import {createEffect, createRoot, onCleanup, onMount, type JSX} from 'solid-js'
import {defineEffect, type EffectCtx} from '@mandarax/extensions'
import {roomId} from '../room.js'
import type {SceneElement} from './glue.js'

type CanvasInstance = {show: () => void; hide: () => void}

// Excalidraw takes ~200ms to mount, so tearing it down on close and rebuilding on reopen makes the saved
// scene pop in a beat after the (transparent) overlay opens — a visible jump. Build the canvas once and
// keep it mounted across toggles; closing hides it (visibility, so its size is preserved and there's no
// resize churn on show) and reopening reveals the already-painted scene instantly. One canvas per page.
let canvas: Promise<CanvasInstance> | undefined

async function buildCanvas(ctx: EffectCtx): Promise<CanvasInstance> {
  const [island, sheet] = await Promise.all([import('./island.js'), import('@excalidraw/excalidraw/index.css?inline')])
  if (!document.head.querySelector('[data-whiteboard-style]')) {
    const style = document.createElement('style')
    style.setAttribute('data-whiteboard-style', '')
    style.textContent = sheet.default
    document.head.appendChild(style)
  }
  const host = document.createElement('div')
  host.setAttribute('data-whiteboard-canvas', '')
  host.style.cssText = 'position:fixed;inset:0;z-index:2147482000;visibility:hidden'
  document.body.appendChild(host)
  const pinsHost = document.createElement('div')
  pinsHost.setAttribute('data-whiteboard-pins', '')
  pinsHost.style.cssText = 'position:fixed;inset:0;z-index:2147482001;pointer-events:none;visibility:hidden'
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
  const handle = island.mountIsland({
    container: host,
    initialElements: [],
    onUserChange: (elements) => writer(elements),
    onPointer: (p) => pointer(p),
    theme: 'light',
  })
  let threadHost: HTMLDivElement | undefined
  let disposeThread: (() => void) | undefined
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
  // Re-bind the room whenever the active session changes: the canvas, pins, and presence follow the
  // widget's current session, clearing the previous session's scene + pins. Lives in a detached root so
  // it survives the per-toggle render component being disposed on close.
  createRoot(() =>
    createEffect(() => {
      const room = ctx.sync.room(roomId(ctx.previewId, ctx.sessionId() ?? ''))
      const disposeSync = bindCanvasSync({doc: room.doc, handle, onUserChange: (r) => void (writer = r)})
      const disposeAi = bindAiDraws(room.doc)
      const presence = bindPresence({awareness: room.awareness, handle, self: selfIdentity()})
      pointer = (p) => presence.setCursor(p.x, p.y)
      const disposePins = mountPins({container: pinsHost, doc: room.doc, onOpen: openThread})
      onCleanup(() => {
        closeThread()
        disposePins()
        presence.dispose()
        disposeAi()
        disposeSync()
      })
    }),
  )
  return {
    show: () => {
      host.style.visibility = 'visible'
      pinsHost.style.visibility = 'visible'
    },
    hide: () => {
      closeThread()
      host.style.visibility = 'hidden'
      pinsHost.style.visibility = 'hidden'
    },
  }
}

export const canvasEffect = defineEffect({
  name: 'whiteboard',
  label: 'Whiteboard',
  description: 'The whiteboard canvas overlay.',
  render: (ctx: EffectCtx): JSX.Element => {
    const marker = document.createElement('div')
    marker.setAttribute('data-whiteboard-marker', '')
    onMount(async () => {
      canvas ??= buildCanvas(ctx)
      ;(await canvas).show()
    })
    onCleanup(() => void canvas?.then((c) => c.hide()))
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
