import type {SourceInfo} from 'react-grab'
import {setPicking, setCancelPick} from './picking.js'
import {captureElement} from './capture-element.js'
import type {ElementSource, Grab} from '@conciv/grab'
import '../../conciv-global.js'

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
  // Comment picks reuse react-grab's selection UI but must not copy: onElementSelect intercepts and
  // routes the element to our sink, so no clipboard write and no "Copying" label flash.
  let intercept = false
  const deliver = async (element: Element, text: string): Promise<void> => {
    const box = element.getBoundingClientRect()
    const rect = {x: box.x, y: box.y, width: box.width, height: box.height}
    const [snapshot, info] = await Promise.all([captureElement(element), api.getSource(element)])
    sink?.({text, snapshot, source: toElementSource(info), rect})
  }
  const hooks = {
    // Shrink the chat surface to a "Picking…" pill while selection is active, so the page is
    // reachable and react-grab's overlay (z-index max-int) doesn't fight our modal.
    onActivate: () => setPicking(true),
    onDeactivate: () => setPicking(false),
    // Comment picks: capture the element and return true so react-grab skips its copy flow.
    onElementSelect: (element: Element) => {
      if (!intercept) return
      void deliver(element, element.textContent ?? '')
      return true
    },
    // Plain-select and Style-edit converge here; the text is returned unchanged — it's the
    // agent-bound context. Stays async so the element stays live through the capture.
    transformCopyContent: async (content: string, elements: Element[]) => {
      const el = elements[0]
      if (el) await deliver(el, content)
      return content
    },
  }
  // Comment picks suppress react-grab's cursor label + success flash; copy picks keep them.
  const register = (quiet: boolean): void => {
    api.unregisterPlugin('conciv')
    api.registerPlugin({
      name: 'conciv',
      theme: {
        toolbar: {enabled: false},
        elementLabel: {enabled: !quiet},
        grabbedBoxes: {enabled: !quiet},
      },
      hooks,
    })
  }
  register(false)
  // Let the pill abort the current pick (also covers Esc handling in the shell).
  setCancelPick(() => api.deactivate())
  // Host-app extensibility: register react-grab context-menu/toolbar actions + hooks against OUR
  // instance. Merge onto the shared __CONCIV__ namespace so extension use()/queue keys survive.
  window.__CONCIV__ = {
    ...window.__CONCIV__,
    registerPlugin: api.registerPlugin,
    unregisterPlugin: api.unregisterPlugin,
  }
  return {
    activate: (onGrab) => {
      sink = onGrab
      intercept = false
      register(false)
      api.activate()
    },
    comment: (onGrab) => {
      sink = onGrab
      intercept = true
      register(true)
      api.activate()
    },
    deactivate: () => api.deactivate(),
    isActive: () => api.isActive(),
  }
}
