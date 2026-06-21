import {onCleanup, onMount, type JSX} from 'solid-js'
import {defineEffect} from '@mandarax/extensions'
import type {IslandHandle} from './island-types.js'

// The canvas overlay effect. render() returns a Solid-mounted host div; onMount lazy-imports the React
// island and the Excalidraw CSS (so react/@excalidraw stay out of index.ts's static graph and the
// widget core bundle), injects the CSS once into the effect shadow root, and mounts Excalidraw into
// the host. onCleanup / ctx.disable tears the React root down. No static react/@excalidraw/?inline.
export const canvasEffect = defineEffect({
  name: 'whiteboard',
  label: 'Whiteboard',
  description: 'The whiteboard canvas overlay.',
  render: (): JSX.Element => {
    const host = document.createElement('div')
    host.setAttribute('data-whiteboard-canvas', '')
    host.style.position = 'fixed'
    host.style.inset = '0'
    let handle: IslandHandle | undefined
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
      handle = island.mountIsland({
        container: host,
        initialElements: [],
        onUserChange: () => {},
        onPointer: () => {},
        theme: 'light',
      })
    })
    onCleanup(() => handle?.destroy())
    return host
  },
})
