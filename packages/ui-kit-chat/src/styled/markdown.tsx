import {createSignal, type JSX} from 'solid-js'
import {createStore, produce} from 'solid-js/store'
import {Streamdown} from '@conciv/solid-streamdown'
import type {WorkerToMainMessage} from './highlight-shared.js'
import HighlightWorkerConstructor from './highlight-worker.ts?worker&inline'

const MAX_CACHE_ENTRIES = 512

const [highlightStore, setHighlightStore] = createStore<Record<string, string>>({})
const highlightInsertionOrder: Array<string> = []
const pendingHighlights = new Set<string>()
const [backendReadyTick, bumpBackendReadyTick] = createSignal(0, {equals: false})

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function cacheKey(language: string, code: string): string {
  return `${language}::${code}`
}

function rememberHighlight(key: string, html: string): void {
  const isNewKey = !(key in highlightStore)
  setHighlightStore(key, html)
  if (!isNewKey) return
  highlightInsertionOrder.push(key)
  if (highlightInsertionOrder.length <= MAX_CACHE_ENTRIES) return
  const oldestKey = highlightInsertionOrder.shift()
  if (oldestKey === undefined) return
  setHighlightStore(
    produce((store) => {
      delete store[oldestKey]
    }),
  )
}

type HighlightBackend = {
  isSupported(language: string): boolean
  requestHighlight(key: string, language: string, code: string, streaming: boolean): void
}

type DeferredHighlight = {key: string; code: string}

function createWorkerBackend(worker: Worker): HighlightBackend {
  let precompiledLanguages: Set<string> | null = null
  let regexLanguages: Set<string> | null = null
  let nextId = 0
  const resultCallbacks = new Map<string, (html: string) => void>()
  const streamingRequests = new Map<string, DeferredHighlight | null>()

  function isSupportedLanguage(language: string): boolean {
    return (regexLanguages?.has(language) ?? false) || (precompiledLanguages?.has(language) ?? false)
  }

  function postHighlight(key: string, language: string, code: string, streaming: boolean): void {
    pendingHighlights.add(key)
    if (streaming) streamingRequests.set(language, null)
    const id = String(nextId)
    nextId += 1
    resultCallbacks.set(id, (html) => {
      pendingHighlights.delete(key)
      rememberHighlight(key, html)
      if (!streaming) return
      const deferred = streamingRequests.get(language)
      streamingRequests.delete(language)
      if (deferred === null || deferred === undefined) return
      if (!(deferred.key in highlightStore)) postHighlight(deferred.key, language, deferred.code, true)
    })
    worker.postMessage({type: 'highlight', id, code, lang: language})
  }

  worker.addEventListener('message', (event: MessageEvent<WorkerToMainMessage>) => {
    const message = event.data
    if (message.type === 'ready') {
      if (message.core === 'precompiled') precompiledLanguages = new Set(message.languages)
      else regexLanguages = new Set(message.languages)
      bumpBackendReadyTick((value) => value + 1)
      return
    }
    const callback = resultCallbacks.get(message.id)
    if (!callback) return
    resultCallbacks.delete(message.id)
    callback(message.html)
  })

  return {
    isSupported(language) {
      return isSupportedLanguage(language)
    },
    requestHighlight(key, language, code, streaming) {
      if (!isSupportedLanguage(language)) return
      if (pendingHighlights.has(key)) return
      if (streaming) {
        if (streamingRequests.has(language)) {
          streamingRequests.set(language, {key, code})
          return
        }
      }
      postHighlight(key, language, code, streaming)
    },
  }
}

function createBackend(): HighlightBackend | null {
  if (typeof Worker === 'undefined') return null
  try {
    return createWorkerBackend(new HighlightWorkerConstructor())
  } catch {
    return null
  }
}

let backend: HighlightBackend | null = null
let backendResolved = false

function ensureBackend(): HighlightBackend | null {
  if (!backendResolved) {
    backend = createBackend()
    backendResolved = true
  }
  return backend
}

let started = false

export function isHighlighterWarming(): boolean {
  return started
}

export function warmHighlighter(): void {
  if (started) return
  started = true
  ensureBackend()
}

function plainBlock(code: string): string {
  return `<pre><code>${escapeHtml(code)}</code></pre>`
}

type DiagramTheme = 'default' | 'dark'

type DiagramStyle = {theme: DiagramTheme; fontFamily: string}

const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)'

let diagramCount = 0

function prefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia(DARK_SCHEME_QUERY).matches
}

function diagramStyle(root: Element | null): DiagramStyle {
  const computed = root?.ownerDocument.defaultView?.getComputedStyle(root)
  const scheme = computed?.colorScheme.trim() ?? ''
  const fontFamily = computed?.fontFamily ?? 'inherit'
  if (scheme === 'dark') return {theme: 'dark', fontFamily}
  if (scheme === 'light') return {theme: 'default', fontFamily}
  return {theme: prefersDark() ? 'dark' : 'default', fontFamily}
}

function diagramKey(source: string, style: DiagramStyle | null): string {
  return cacheKey(style ? `mermaid:${style.theme}:${style.fontFamily}` : 'mermaid', source)
}

function connectedStyle(root: Element | null): DiagramStyle | null {
  if (!root?.isConnected) return null
  return diagramStyle(root)
}

async function renderDiagram(source: string, style: DiagramStyle): Promise<string> {
  const {default: mermaid} = await import('mermaid')
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    fontFamily: style.fontFamily,
    theme: style.theme,
  })
  diagramCount += 1
  const {svg} = await mermaid.render(`conciv-diagram-${diagramCount}`, source)
  return `<div class="chat-diagram">${svg}</div>`
}

async function settleDiagram(source: string, root: () => Element | null): Promise<void> {
  await import('mermaid')
  const style = connectedStyle(root()) ?? diagramStyle(null)
  const themedKey = diagramKey(source, style)
  const html = highlightStore[themedKey] ?? (await renderDiagram(source, style).catch(() => plainBlock(source)))
  rememberHighlight(themedKey, html)
  rememberHighlight(diagramKey(source, null), html)
}

function requestDiagram(source: string, root: () => Element | null): void {
  const pendingKey = diagramKey(source, null)
  if (pendingHighlights.has(pendingKey)) return
  pendingHighlights.add(pendingKey)
  void settleDiagram(source, root)
    .catch(() => undefined)
    .finally(() => pendingHighlights.delete(pendingKey))
}

function diagramBlock(code: string, streaming: boolean, root: () => Element | null): string {
  if (streaming) return plainBlock(code)
  const style = connectedStyle(root())
  const themed = style ? highlightStore[diagramKey(code, style)] : undefined
  if (themed !== undefined) return themed
  requestDiagram(code, root)
  return highlightStore[diagramKey(code, null)] ?? plainBlock(code)
}

function codeBlock(code: string, lang: string | undefined, streaming: boolean, root: () => Element | null): string {
  backendReadyTick()
  const requested = (lang ?? '').trim().toLowerCase()
  if (requested === 'mermaid') return diagramBlock(code, streaming, root)
  const active = ensureBackend()
  if (!active || !active.isSupported(requested)) return plainBlock(code)
  const key = cacheKey(requested, code)
  const cached = highlightStore[key]
  if (cached !== undefined) return cached
  active.requestHighlight(key, requested, code, streaming)
  return plainBlock(code)
}

export type MarkdownProps = {content: string; streaming?: boolean}

export function Markdown(props: MarkdownProps): JSX.Element {
  warmHighlighter()
  let root: Element | null = null
  const highlightCode = (code: string, lang: string | undefined): string =>
    codeBlock(code, lang, props.streaming === true, () => root)
  const view = (
    <Streamdown
      class={props.streaming ? 'prose-chat chat-caret-live' : 'prose-chat'}
      isAnimating={props.streaming === true}
      caret={props.streaming ? 'block' : false}
      highlightCode={highlightCode}
    >
      {props.content}
    </Streamdown>
  )
  root = view instanceof Element ? view : null
  return view
}
