import {createResource, createRoot, type Accessor, createSignal} from 'solid-js'
import {type Grab, type GrabActions, type ElementSource, type GrabFrame, composeGrabText} from '@conciv/grab'
import type {SourceInfo} from 'react-grab'
import {capturePreview} from './grab-preview.js'
import {framesForElement, sourceFromAttr} from './react.js'
import type {SourceLoc} from '@conciv/frontend-plugin-api/page'
import type {BaseContext} from '@conciv/frontend-plugin-api'

export type ReactGrab = {api: GrabActions; dispose: () => void}

type PendingPick = {resolve: (grab: Grab | null | Promise<Grab>) => void; grab: Promise<Grab> | null}

export function createReactGrab(log: BaseContext['log']): ReactGrab {
  const [picking, setPickingSignal] = createSignal(false)
  const state: {
    cancel: (() => void) | null
    pending: PendingPick | null
    adapter: Promise<ReactGrabAdapter> | null
    module: Promise<typeof import('react-grab')> | null
    pickerLoaded: {ready: Accessor<boolean>; dispose: () => void} | null
  } = {cancel: null, pending: null, adapter: null, module: null, pickerLoaded: null}

  const setPicking = (active: boolean): void => {
    const wasPicking = picking()
    setPickingSignal(active)
    if (active || !wasPicking) return
    const finished = state.pending
    if (!finished) return
    state.pending = null
    finished.resolve(finished.grab)
  }

  const setCancelPick = (fn: (() => void) | null): void => {
    state.cancel = fn
  }

  const cancelPick = (): void => {
    state.cancel?.()
  }

  const loadReactGrab = (): Promise<typeof import('react-grab')> => {
    if (state.module) return state.module
    window.__REACT_GRAB_DISABLED__ = true
    state.module = import('react-grab')
    return state.module
  }

  const getReactGrabAdapter = (): Promise<ReactGrabAdapter> => {
    state.adapter ??= loadReactGrab().then((rg) => createAdapter(rg, setPicking, setCancelPick, log))
    return state.adapter
  }

  const startPick = (mode: 'activate' | 'comment'): Promise<Grab | null> =>
    new Promise((resolve) => {
      state.pending?.resolve(null)
      const pick: PendingPick = {resolve, grab: null}
      state.pending = pick
      void getReactGrabAdapter().then(
        (adapter) =>
          adapter[mode]((grab) => {
            if (state.pending !== pick) return
            pick.grab = grab
          }),
        (cause: unknown) => {
          log.error({action: 'page', message: 'the element picker did not start', error: cause})
          if (state.pending !== pick) return
          state.pending = null
          resolve(null)
        },
      )
    })

  const pickerReady = (): boolean => {
    state.pickerLoaded ??= createRoot((dispose) => {
      const [picker] = createResource(loadReactGrab)
      return {ready: () => picker.state === 'ready', dispose}
    })
    return state.pickerLoaded.ready()
  }

  const dispose = (): void => {
    const adapter = state.adapter
    state.adapter = null
    setCancelPick(null)
    setPicking(false)
    state.pickerLoaded?.dispose()
    state.pickerLoaded = null
    void adapter?.then(
      (current) => current.dispose(),
      () => undefined,
    )
  }

  return {
    api: {
      pick: () => startPick('activate'),
      comment: () => startPick('comment'),
      cancel: cancelPick,
      isActive: picking,
      grabbable: pickerReady,
    },
    dispose,
  }
}

type GrabSink = (grab: Promise<Grab>) => void

function toElementSource(info: SourceInfo | null): ElementSource | null {
  if (!info) return null
  return {componentName: info.componentName, filePath: info.filePath, lineNumber: info.lineNumber}
}

function fromSourceLoc(source: SourceLoc): ElementSource {
  return {componentName: null, filePath: source.file, lineNumber: source.line}
}

async function grabFrames(element: Element, log: BaseContext['log']): Promise<GrabFrame[]> {
  const frames = await framesForElement(element, log)
  return frames.flatMap((frame) => {
    if (!frame.fileName || typeof frame.line !== 'number') return []
    return [{fileName: frame.fileName, line: frame.line, ...(frame.column === undefined ? {} : {column: frame.column})}]
  })
}

async function unresolvedFrames(
  element: Element,
  source: SourceLoc | null,
  log: BaseContext['log'],
): Promise<{frames?: GrabFrame[]}> {
  if (source) return {}
  const frames = await grabFrames(element, log)
  return frames.length > 0 ? {frames} : {}
}

export type ReactGrabAdapter = {
  activate: (onGrab: GrabSink) => void
  comment: (onGrab: GrabSink) => void
  deactivate: () => void
  isActive: () => boolean
  dispose: () => void
}

async function createAdapter(
  rg: typeof import('react-grab'),
  setPicking: (active: boolean) => void,
  setCancelPick: (fn: (() => void) | null) => void,
  log: BaseContext['log'],
): Promise<ReactGrabAdapter> {
  const api = rg.init({telemetry: false})

  let sink: GrabSink | null = null

  let intercept = false
  const capture = async (element: Element, fallback: string): Promise<Grab> => {
    const box = element.getBoundingClientRect()
    const [preview, info] = await Promise.all([capturePreview(element), api.getSource(element)])
    const {snippet, source, text} = groundGrabText(element, fallback)
    const unresolved = await unresolvedFrames(element, source, log)
    return {
      text,
      preview,
      source: source ? fromSourceLoc(source) : toElementSource(info),
      rect: {x: box.x, y: box.y, width: box.width, height: box.height},
      snippet,
      ...unresolved,
    }
  }
  const deliver = (element: Element, fallback: string): Promise<Grab> => {
    const delivery = capture(element, fallback)
    sink?.(delivery)
    return delivery
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
      void deliver(element, elementSnippet(element))
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
const VOID_TAGS: readonly string[] = [
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
]

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
  if (VOID_TAGS.includes(tag)) return open
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
