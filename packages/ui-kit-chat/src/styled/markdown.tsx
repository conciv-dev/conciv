import {
  createContext,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  Show,
  useContext,
  type JSX,
  type ParentProps,
} from 'solid-js'
import {mapValues, memoize} from 'es-toolkit'
import {ReactiveMap} from '@solid-primitives/map'
import {Highlight} from '@conciv/ui-kit-system'
import {
  Streamdown,
  type FenceView,
  type HastElement,
  type HighlightCode,
  type LocalFileExists,
  type OpenLocalFile,
} from '@conciv/solid-streamdown'
import type {WorkerToMainMessage} from './highlight-shared.js'

const MAX_CACHE_ENTRIES = 512

function createBoundedCache<Value>() {
  const entries = new ReactiveMap<string, Value>()
  function remember(key: string, value: Value): void {
    entries.set(key, value)
    if (entries.size <= MAX_CACHE_ENTRIES) return
    const oldestKey = entries.keys().next().value
    if (oldestKey === undefined) return
    entries.delete(oldestKey)
  }
  return {entries, remember}
}

const highlights = createBoundedCache<HastElement>()
const diagrams = createBoundedCache<string>()
const latestStreamedCode = createBoundedCache<string>()
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

function createWorkerBackend(worker: Promise<Worker | null>): HighlightBackend {
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
      if (pre) latestStreamedCode.remember(language, code)
      const deferred = streamingRequests.get(language)
      streamingRequests.delete(language)
      if (deferred === null || deferred === undefined) return
      if (!highlights.entries.has(deferred.key)) postHighlight(deferred.key, language, deferred.code, true)
    })
    void worker.then((ready) => ready?.postMessage({type: 'highlight', id, code, lang: language}))
  }

  function onMessage(event: MessageEvent<WorkerToMainMessage>): void {
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
  }

  void worker.then((ready) => ready?.addEventListener('message', onMessage))

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
  return createWorkerBackend(
    import('./highlight-worker.ts?worker&inline').then((module) => new module.default()).catch(() => null),
  )
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
    const cached = diagrams.entries.get(key)
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
  const cached = highlights.entries.get(cacheKey(language, highlighted))
  return cached && withStreamedTail(cached, fenceText.slice(highlighted.length))
}

function streamedPrefix(language: string, fenceText: string): HastElement | undefined {
  const prefix = latestStreamedCode.entries.get(language)
  if (prefix === undefined || !fenceText.startsWith(prefix)) return undefined
  return highlightedWithTail(language, prefix, fenceText)
}

function codeBlock(fenceText: string, lang: string | undefined, streaming: boolean): ReturnType<HighlightCode> {
  backendReadyTick()
  const requested = fenceLanguage(lang)
  if (requested === 'mermaid') return streaming ? undefined : MermaidDiagram
  const active = ensureBackend()
  if (!active || !active.isSupported(requested)) return undefined
  const code = fenceCode(fenceText)
  const highlighted = highlightedWithTail(requested, code, fenceText)
  if (highlighted) return highlighted
  active.requestHighlight(cacheKey(requested, code), requested, code, streaming)
  return streamedPrefix(requested, fenceText)
}

export type MarkdownProps = {
  content: string
  streaming?: boolean
  compact?: boolean
  highlight?: readonly string[]
}

const NO_LINK_PREFIXES: string[] = []

const MarkdownHighlightContext = createContext<readonly string[]>([])

export const MarkdownHighlightProvider = MarkdownHighlightContext.Provider

export function HighlightedText(props: {text: string}): JSX.Element {
  const words = useContext(MarkdownHighlightContext)
  return (
    <Show when={words.length > 0} fallback={props.text}>
      <Highlight text={props.text} query={[...words]} ignoreCase matchAll exactMatch />
    </Show>
  )
}

type MarkdownCodeBlock = {
  readonly code: string
  readonly language: string
}

type MarkdownCodeBlockMatch = {
  readonly render: ReadonlySet<string>
  readonly actions: ReadonlySet<string>
}

export type MarkdownCodeAction = {
  readonly icon: string
  readonly title: string
  run(block: MarkdownCodeBlock): void
}

export type MarkdownCodeBlocks = {
  readonly current: () => MarkdownCodeBlockMatch
  readonly render: (target: HTMLElement, block: MarkdownCodeBlock, fallback: () => void) => (() => void) | undefined
  readonly actions: (language: string) => readonly MarkdownCodeAction[]
}

const MarkdownContext = createContext<{
  readonly openLocalFile?: OpenLocalFile
  readonly localFileExists?: LocalFileExists
  readonly codeBlocks?: MarkdownCodeBlocks
}>()

export function MarkdownProvider(
  props: ParentProps<{
    openLocalFile?: OpenLocalFile
    localFileExists?: LocalFileExists
    codeBlocks?: MarkdownCodeBlocks | false
  }>,
): JSX.Element {
  const parent = useMarkdown()
  return (
    <MarkdownContext.Provider
      value={{
        get openLocalFile() {
          return props.openLocalFile
        },
        get localFileExists() {
          return props.localFileExists ?? parent?.localFileExists
        },
        get codeBlocks() {
          if (props.codeBlocks === false) return undefined
          return props.codeBlocks ?? parent?.codeBlocks
        },
      }}
    >
      {props.children}
    </MarkdownContext.Provider>
  )
}

export const useMarkdown = () => useContext(MarkdownContext)

function CodeBlockContent(props: {language: string; code: string; fallback: () => void}): JSX.Element {
  const markdown = useMarkdown()
  const block = createMemo(() => ({code: fenceCode(props.code), language: props.language}))
  return (
    <Show when={block()} keyed>
      {(current) => (
        <div
          ref={(target) =>
            onMount(() => {
              const dispose = markdown?.codeBlocks?.render(target, current, props.fallback)
              if (!dispose) return props.fallback()
              onCleanup(dispose)
            })
          }
        />
      )}
    </Show>
  )
}

const codeBlockView = memoize((language: string): FenceView => (props) => (
  <CodeBlockContent language={language} code={props.code} fallback={props.fallback} />
))

function fenceLanguage(lang: string | undefined): string {
  return (lang ?? '').trim().toLowerCase()
}

function fenceCode(fenceText: string): string {
  return fenceText.endsWith('\n') ? fenceText.slice(0, -1) : fenceText
}

export function Markdown(props: MarkdownProps): JSX.Element {
  const inherited = useContext(MarkdownHighlightContext)
  const highlight = () => props.highlight ?? inherited
  return (
    <Show
      when={props.compact}
      fallback={<FullMarkdown content={props.content} streaming={props.streaming} highlight={highlight()} />}
    >
      <Streamdown
        class="chat-markdown-compact"
        allowedLinkPrefixes={NO_LINK_PREFIXES}
        linkBlockPolicy="text-only"
        highlight={highlight()}
      >
        {props.content}
      </Streamdown>
    </Show>
  )
}

function FullMarkdown(props: Omit<MarkdownProps, 'compact'>): JSX.Element {
  warmHighlighter()
  const markdown = useMarkdown()
  const highlightCode: HighlightCode = (code, lang) => {
    const language = fenceLanguage(lang)
    const content = props.streaming !== true && markdown?.codeBlocks?.current().render.has(language)
    if (content) return codeBlockView(language)
    return codeBlock(code, lang, props.streaming === true)
  }
  return (
    <Streamdown
      class={props.streaming ? 'prose-chat chat-caret-live' : 'prose-chat'}
      isAnimating={props.streaming === true}
      caret={props.streaming ? 'block' : false}
      highlightCode={highlightCode}
      highlight={props.highlight}
      openLocalFile={markdown?.openLocalFile}
      localFileExists={markdown?.localFileExists}
    >
      {props.content}
    </Streamdown>
  )
}
