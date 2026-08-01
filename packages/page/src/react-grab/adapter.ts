import type {SourceInfo} from 'react-grab'
import {setPicking, setCancelPick} from './picking.js'
import {captureElement} from './capture-element.js'
import {groundGrabText} from './grab-text.js'
import {framesForElement} from '../react-bridge.js'
import type {ElementSource, Grab, GrabFrame} from '@conciv/grab'
import type {SourceLoc} from '@conciv/protocol/page-introspect-types'
import '../conciv-global.js'

export type GrabSink = (grab: Grab) => void

function toElementSource(info: SourceInfo | null): ElementSource | null {
  if (!info) return null
  return {componentName: info.componentName, filePath: info.filePath, lineNumber: info.lineNumber}
}

function fromSourceLoc(source: SourceLoc): ElementSource {
  return {componentName: null, filePath: source.file, lineNumber: source.line}
}

function grabFrames(element: Element): GrabFrame[] {
  return framesForElement(element).flatMap((frame) => {
    if (!frame.fileName || typeof frame.line !== 'number') return []
    return [{fileName: frame.fileName, line: frame.line, ...(frame.column === undefined ? {} : {column: frame.column})}]
  })
}

function unresolvedFrames(element: Element, source: SourceLoc | null): {frames?: GrabFrame[]} {
  if (source) return {}
  const frames = grabFrames(element)
  return frames.length > 0 ? {frames} : {}
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
  const deliver = async (element: Element, fallback: string): Promise<void> => {
    const box = element.getBoundingClientRect()
    const [preview, info] = await Promise.all([captureElement(element), api.getSource(element)])
    const {snippet, source, text} = groundGrabText(element, fallback)
    sink?.({
      text,
      preview,
      source: source ? fromSourceLoc(source) : toElementSource(info),
      rect: {x: box.x, y: box.y, width: box.width, height: box.height},
      snippet,
      ...unresolvedFrames(element, source),
    })
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
