import {createSignal, onMount, Show, type JSX} from 'solid-js'
import {createStore, produce, unwrap} from 'solid-js/store'
import {mapValues} from 'es-toolkit'
import {Streamdown, type HastElement, type HighlightCode} from '@conciv/solid-streamdown'
import type {WorkerToMainMessage} from './highlight-shared.js'
import HighlightWorkerConstructor from './highlight-worker.ts?worker&inline'

const MAX_CACHE_ENTRIES = 512

function createBoundedStore<Value>() {
  const [store, setStore] = createStore<Record<string, Value>>({})
  const insertionOrder: Array<string> = []
  function remember(key: string, value: Value): void {
    const isNewKey = !(key in store)
    setStore(key, () => value)
    if (!isNewKey) return
    insertionOrder.push(key)
    if (insertionOrder.length <= MAX_CACHE_ENTRIES) return
    const oldestKey = insertionOrder.shift()
    if (oldestKey === undefined) return
    setStore(
      produce((draft) => {
        delete draft[oldestKey]
      }),
    )
  }
  return {store, remember}
}

const highlights = createBoundedStore<HastElement>()
const diagrams = createBoundedStore<string>()
const [latestStreamedCode, setLatestStreamedCode] = createStore<Record<string, string>>({})
const pendingHighlights = new Set<string>()
const [backendReadyTick, bumpBackendReadyTick] = createSignal(0, {equals: false})

function cacheKey(language: string, code: string): string {
  return `${language}::${code}`
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
  const resultCallbacks = new Map<string, (pre: HastElement | null) => void>()
  const streamingRequests = new Map<string, DeferredHighlight | null>()

  function isSupportedLanguage(language: string): boolean {
    return (regexLanguages?.has(language) ?? false) || (precompiledLanguages?.has(language) ?? false)
  }

  function postHighlight(key: string, language: string, code: string, streaming: boolean): void {
    pendingHighlights.add(key)
    if (streaming) streamingRequests.set(language, null)
    const id = String(nextId)
    nextId += 1
    resultCallbacks.set(id, (pre) => {
      pendingHighlights.delete(key)
      if (pre) highlights.remember(key, pre)
      if (!streaming) return
      if (pre) setLatestStreamedCode(language, code)
      const deferred = streamingRequests.get(language)
      streamingRequests.delete(language)
      if (deferred === null || deferred === undefined) return
      if (!(deferred.key in highlights.store)) postHighlight(deferred.key, language, deferred.code, true)
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
    callback(message.pre)
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

const DIAGRAM_TOKENS = {
  background: '--chat-bg',
  primaryColor: '--chat-fill-strong',
  secondaryColor: '--chat-fill',
  tertiaryColor: '--chat-fill-soft',
  primaryBorderColor: '--chat-line-2',
  secondaryBorderColor: '--chat-line-2',
  tertiaryBorderColor: '--chat-line',
  primaryTextColor: '--chat-text',
  secondaryTextColor: '--chat-text',
  tertiaryTextColor: '--chat-text-2',
  textColor: '--chat-text',
  lineColor: '--chat-text-3',
  edgeLabelBackground: '--chat-bg',
  clusterBkg: '--chat-fill-soft',
  clusterBorder: '--chat-line',
  noteBkgColor: '--chat-perm-chip-bg',
  noteBorderColor: '--chat-perm-line',
  noteTextColor: '--chat-text',
} as const

type DiagramStyle = {
  darkMode: boolean
  fontFamily: string
  themeVariables: Record<keyof typeof DIAGRAM_TOKENS, string>
}

let diagramCount = 0

function resolvedColor(probe: HTMLElement, token: string): string {
  probe.style.color = `var(${token})`
  return getComputedStyle(probe).color
}

function diagramStyle(element: HTMLElement): DiagramStyle {
  const computed = getComputedStyle(element)
  const probe = document.createElement('span')
  element.append(probe)
  const themeVariables = mapValues(DIAGRAM_TOKENS, (token) => resolvedColor(probe, token))
  probe.remove()
  return {darkMode: computed.colorScheme.trim() === 'dark', fontFamily: computed.fontFamily, themeVariables}
}

async function renderDiagram(source: string, style: DiagramStyle): Promise<string> {
  const {default: mermaid} = await import('mermaid')
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    fontFamily: style.fontFamily,
    theme: 'base',
    themeVariables: {...style.themeVariables, darkMode: style.darkMode, fontFamily: style.fontFamily},
  })
  diagramCount += 1
  const {svg} = await mermaid.render(`conciv-diagram-${diagramCount}`, source)
  return svg
}

function MermaidDiagram(props: {code: string}): JSX.Element {
  const [svg, setSvg] = createSignal<string>()
  let source: HTMLPreElement | undefined
  onMount(() => {
    if (!source) return
    const style = diagramStyle(source)
    const key = cacheKey(`mermaid:${JSON.stringify(style)}`, props.code)
    const cached = diagrams.store[key]
    if (cached !== undefined) return setSvg(cached)
    void renderDiagram(props.code, style)
      .then((markup) => {
        diagrams.remember(key, markup)
        setSvg(markup)
      })
      .catch(() => undefined)
  })
  return (
    <Show
      when={svg()}
      fallback={
        <pre
          ref={(element) => {
            source = element
          }}
        >
          <code>{props.code}</code>
        </pre>
      }
    >
      {(markup) => (
        <div
          class="chat-diagram"
          ref={(element) => {
            element.innerHTML = markup()
          }}
        />
      )}
    </Show>
  )
}

function withStreamedTail(pre: HastElement, tail: string): HastElement {
  if (!tail) return pre
  return {
    ...pre,
    children: pre.children.map((child) =>
      child.type === 'element' && child.tagName === 'code'
        ? {...child, children: [...child.children, {type: 'text', value: tail}]}
        : child,
    ),
  }
}

function highlightedWithTail(language: string, highlighted: string, fenceText: string): HastElement | undefined {
  const cached = highlights.store[cacheKey(language, highlighted)]
  return cached && withStreamedTail(unwrap(cached), fenceText.slice(highlighted.length))
}

function streamedPrefix(language: string, fenceText: string): HastElement | undefined {
  const prefix = latestStreamedCode[language]
  if (prefix === undefined || !fenceText.startsWith(prefix)) return undefined
  return highlightedWithTail(language, prefix, fenceText)
}

function codeBlock(fenceText: string, lang: string | undefined, streaming: boolean): ReturnType<HighlightCode> {
  backendReadyTick()
  const requested = (lang ?? '').trim().toLowerCase()
  if (requested === 'mermaid') return streaming ? undefined : MermaidDiagram
  const active = ensureBackend()
  if (!active || !active.isSupported(requested)) return undefined
  const code = fenceText.endsWith('\n') ? fenceText.slice(0, -1) : fenceText
  const highlighted = highlightedWithTail(requested, code, fenceText)
  if (highlighted) return highlighted
  active.requestHighlight(cacheKey(requested, code), requested, code, streaming)
  return streamedPrefix(requested, fenceText)
}

export type MarkdownProps = {content: string; streaming?: boolean}

export function Markdown(props: MarkdownProps): JSX.Element {
  warmHighlighter()
  const highlightCode: HighlightCode = (code, lang) => codeBlock(code, lang, props.streaming === true)
  return (
    <Streamdown
      class={props.streaming ? 'prose-chat chat-caret-live' : 'prose-chat'}
      isAnimating={props.streaming === true}
      caret={props.streaming ? 'block' : false}
      highlightCode={highlightCode}
    >
      {props.content}
    </Streamdown>
  )
}
