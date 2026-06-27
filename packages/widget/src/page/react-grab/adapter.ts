import type {SourceInfo} from 'react-grab'
import {setPicking, setCancelPick} from './picking.js'
import {captureElement} from './capture-element.js'
import type {ElementSource, Grab} from '@mandarax/grab'
import '../../mandarax-global.js'

// Lazy, dev-only integration of react-grab as the element-selection engine. Auto-init and the
// react-grab toolbar are disabled; we drive it from the composer. Every grab (select/comment/
// style-edit) converges on runCopyFlow, so transformCopyContent is the one hook that routes the
// final content into whichever composer started the current pick. Dynamic import (not static) so
// we can set the disable flag before the module evaluates, and to defer init to first use.

export type GrabSink = (grab: Grab) => void

// The one place react-grab's SourceInfo crosses into our domain types.
function toElementSource(info: SourceInfo | null): ElementSource | null {
  if (!info) return null
  return {componentName: info.componentName, filePath: info.filePath, lineNumber: info.lineNumber}
}

export type ReactGrabAdapter = {
  activate: (onGrab: GrabSink) => void // bind sink, then enter selection mode
  comment: (onGrab: GrabSink) => void // bind sink, then enter prompt mode
  deactivate: () => void
  isActive: () => boolean
}

let adapterPromise: Promise<ReactGrabAdapter> | null = null

export function getReactGrabAdapter(): Promise<ReactGrabAdapter> {
  if (!adapterPromise) adapterPromise = create()
  return adapterPromise
}

async function create(): Promise<ReactGrabAdapter> {
  window.__REACT_GRAB_DISABLED__ = true
  const rg = await import('react-grab')
  const api = rg.init({telemetry: false})
  // The current pick's destination. react-grab selection is modal (one pick at a time), so a single
  // mutable sink is race-free; activate()/comment() set it immediately before entering selection.
  let sink: GrabSink | null = null
  api.registerPlugin({
    name: 'mandarax',
    theme: {toolbar: {enabled: false}},
    hooks: {
      // Shrink the chat surface to a "Picking…" pill while selection is active, so the page is
      // reachable and react-grab's overlay (z-index max-int) doesn't fight our modal.
      onActivate: () => setPicking(true),
      onDeactivate: () => setPicking(false),
      // Captures plain-select, Comment, and Style-edit content alike. Stays async so the pick stays
      // open (element live) through the rAF capture + source lookup; both run before react-grab
      // unfreezes the page. The text is returned unchanged — it's the agent-bound context.
      transformCopyContent: async (content, elements) => {
        const el = elements[0]
        if (el) {
          const box = el.getBoundingClientRect()
          const rect = {x: box.x, y: box.y, width: box.width, height: box.height}
          const [snapshot, info] = await Promise.all([captureElement(el), api.getSource(el)])
          sink?.({text: content, snapshot, source: toElementSource(info), rect})
        }
        return content
      },
    },
  })
  // Let the pill abort the current pick (also covers Esc handling in the shell).
  setCancelPick(() => api.deactivate())
  // Host-app extensibility: register react-grab context-menu/toolbar actions + hooks against OUR
  // instance. Merge onto the shared __MANDARAX__ namespace so extension use()/queue keys survive.
  window.__MANDARAX__ = {
    ...window.__MANDARAX__,
    registerPlugin: api.registerPlugin,
    unregisterPlugin: api.unregisterPlugin,
  }
  return {
    activate: (onGrab) => {
      sink = onGrab
      api.activate()
    },
    comment: (onGrab) => {
      sink = onGrab
      api.comment()
    },
    deactivate: () => api.deactivate(),
    isActive: () => api.isActive(),
  }
}
