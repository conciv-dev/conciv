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

function codeBlock(code: string, lang: string | undefined, streaming: boolean): string {
  backendReadyTick()
  const requested = (lang ?? '').trim().toLowerCase()
  const active = ensureBackend()
  if (!active || !active.isSupported(requested)) return `<pre><code>${escapeHtml(code)}</code></pre>`
  const key = cacheKey(requested, code)
  const cached = highlightStore[key]
  if (cached !== undefined) return cached
  active.requestHighlight(key, requested, code, streaming)
  return `<pre><code>${escapeHtml(code)}</code></pre>`
}

export type MarkdownProps = {content: string; streaming?: boolean}

export function Markdown(props: MarkdownProps): JSX.Element {
  warmHighlighter()
  const highlightCode = (code: string, lang: string | undefined): string =>
    codeBlock(code, lang, props.streaming === true)
  return (
    <Streamdown
      class={props.streaming ? 'prose-pw chat-caret-live' : 'prose-pw'}
      isAnimating={props.streaming === true}
      caret={props.streaming ? 'block' : false}
      highlightCode={highlightCode}
    >
      {props.content}
    </Streamdown>
  )
}
