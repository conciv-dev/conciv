import {createEffect, createResource, createRoot, type Accessor, createSignal} from 'solid-js'
import {type Grab, type GrabApi, type ElementSource, type GrabFrame, composeGrabText} from '@conciv/grab'
import type {SourceInfo} from 'react-grab'
import {captureElement} from './grab-preview.js'
import {framesForElement, sourceFromAttr} from './react.js'
import type {SourceLoc} from '@conciv/plugin/experimental/page'

const [picking, setPicking] = createSignal(false)

let cancelFn: (() => void) | null = null

export function setCancelPick(fn: (() => void) | null): void {
  cancelFn = fn
}
export function cancelPick(): void {
  cancelFn?.()
}

type PendingPick = {resolve: (grab: Grab | null) => void; grab: Grab | null}

let pending: PendingPick | null = null

createRoot(() => {
  createEffect(() => {
    if (picking()) return
    const finished = pending
    if (!finished) return
    pending = null
    finished.resolve(finished.grab)
  })
})

function startPick(mode: 'activate' | 'comment'): Promise<Grab | null> {
  return new Promise((resolve) => {
    pending?.resolve(null)
    const pick: PendingPick = {resolve, grab: null}
    pending = pick
    void getReactGrabAdapter().then(
      (adapter) =>
        adapter[mode]((grab) => {
          if (pending !== pick) return
          pick.grab = grab
        }),
      (cause: unknown) => {
        console.error('[page] the element picker did not start', cause)
        if (pending !== pick) return
        pending = null
        resolve(null)
      },
    )
  })
}

let pickerLoaded: Accessor<boolean> | undefined

function pickerReady(): boolean {
  pickerLoaded ??= createRoot(() => {
    const [picker] = createResource(loadReactGrab)
    return () => picker.state === 'ready'
  })
  return pickerLoaded()
}

export const grabApi: Omit<GrabApi, 'stage' | 'staged' | 'clear'> = {
  pick: () => startPick('activate'),
  comment: () => startPick('comment'),
  cancel: cancelPick,
  isActive: picking,
  grabbable: pickerReady,
}

type GrabSink = (grab: Grab) => void

function toElementSource(info: SourceInfo | null): ElementSource | null {
  if (!info) return null
  return {componentName: info.componentName, filePath: info.filePath, lineNumber: info.lineNumber}
}

function fromSourceLoc(source: SourceLoc): ElementSource {
  return {componentName: null, filePath: source.file, lineNumber: source.line}
}

async function grabFrames(element: Element): Promise<GrabFrame[]> {
  const frames = await framesForElement(element)
  return frames.flatMap((frame) => {
    if (!frame.fileName || typeof frame.line !== 'number') return []
    return [{fileName: frame.fileName, line: frame.line, ...(frame.column === undefined ? {} : {column: frame.column})}]
  })
}

async function unresolvedFrames(element: Element, source: SourceLoc | null): Promise<{frames?: GrabFrame[]}> {
  if (source) return {}
  const frames = await grabFrames(element)
  return frames.length > 0 ? {frames} : {}
}

export type ReactGrabAdapter = {
  activate: (onGrab: GrabSink) => void
  comment: (onGrab: GrabSink) => void
  deactivate: () => void
  isActive: () => boolean
  dispose: () => void
}

let adapterPromise: Promise<ReactGrabAdapter> | null = null
let modulePromise: Promise<typeof import('react-grab')> | null = null

export function loadReactGrab(): Promise<typeof import('react-grab')> {
  if (modulePromise) return modulePromise
  window.__REACT_GRAB_DISABLED__ = true
  modulePromise = import('react-grab')
  return modulePromise
}

function getReactGrabAdapter(): Promise<ReactGrabAdapter> {
  if (!adapterPromise) adapterPromise = create()
  return adapterPromise
}

export function disposeReactGrab(): void {
  const adapter = adapterPromise
  adapterPromise = null
  setCancelPick(null)
  setPicking(false)
  void adapter?.then(
    (current) => current.dispose(),
    () => undefined,
  )
}

async function create(): Promise<ReactGrabAdapter> {
  const rg = await loadReactGrab()
  const api = rg.init({telemetry: false})

  let sink: GrabSink | null = null

  let intercept = false
  const deliver = async (element: Element, fallback: string): Promise<void> => {
    const box = element.getBoundingClientRect()
    const [preview, info] = await Promise.all([captureElement(element), api.getSource(element)])
    const {snippet, source, text} = groundGrabText(element, fallback)
    const unresolved = await unresolvedFrames(element, source)
    sink?.({
      text,
      preview,
      source: source ? fromSourceLoc(source) : toElementSource(info),
      rect: {x: box.x, y: box.y, width: box.width, height: box.height},
      snippet,
      ...unresolved,
    })
  }
  const hooks = {
    onActivate: () => {
      setPicking(true)
    },
    onDeactivate: () => {
      setPicking(false)
    },

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
    dispose: () => api.dispose(),
  }
}

const MAX_TEXT = 80
const MAX_CLASS = 60
const NAMED_ATTRS = ['id', 'role', 'aria-label']
const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
])

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`
}

function salientAttributes(element: Element): string {
  const parts = NAMED_ATTRS.flatMap((name) => {
    const value = element.getAttribute(name)
    return value ? [`${name}="${collapse(value)}"`] : []
  })
  const className = collapse(element.getAttribute('class') ?? '')
  if (className) parts.push(`class="${truncate(className, MAX_CLASS)}"`)
  return parts.length > 0 ? ` ${parts.join(' ')}` : ''
}

export function elementSnippet(element: Element): string {
  const tag = element.tagName.toLowerCase()
  const open = `<${tag}${salientAttributes(element)}>`
  if (VOID_TAGS.has(tag)) return open
  const text = truncate(collapse(element.textContent ?? ''), MAX_TEXT)
  if (!text) return open
  return `${open}${text}</${tag}>`
}

export function groundGrabText(
  element: Element,
  fallback: string,
): {snippet: string; source: SourceLoc | null; text: string} {
  const snippet = elementSnippet(element)
  const source = sourceFromAttr(element)
  return {snippet, source, text: composeGrabText(snippet, source, fallback)}
}
