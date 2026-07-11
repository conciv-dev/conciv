import type {SourceInfo} from 'react-grab'
import {setPicking, setCancelPick} from './picking.js'
import {captureElement} from './capture-element.js'
import type {ElementSource, Grab} from '@conciv/grab'
import '../conciv-global.js'

export type GrabSink = (grab: Grab) => void

function toElementSource(info: SourceInfo | null): ElementSource | null {
  if (!info) return null
  return {componentName: info.componentName, filePath: info.filePath, lineNumber: info.lineNumber}
}

export type ReactGrabAdapter = {
  activate: (onGrab: GrabSink) => void
  comment: (onGrab: GrabSink) => void
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

  let sink: GrabSink | null = null

  let intercept = false
  const deliver = async (element: Element, text: string): Promise<void> => {
    const box = element.getBoundingClientRect()
    const rect = {x: box.x, y: box.y, width: box.width, height: box.height}
    const [snapshot, info] = await Promise.all([captureElement(element), api.getSource(element)])
    sink?.({text, snapshot, source: toElementSource(info), rect})
  }
  const hooks = {
    onActivate: () => setPicking(true),
    onDeactivate: () => setPicking(false),

    onElementSelect: (element: Element) => {
      if (!intercept) return
      void deliver(element, element.textContent ?? '')
      return true
    },

    transformCopyContent: async (content: string, elements: Element[]) => {
      const el = elements[0]
      if (el) await deliver(el, content)
      return content
    },
  }

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

  setCancelPick(() => api.deactivate())

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
