import {
  createContext,
  createMemo,
  createSignal,
  createUniqueId,
  Index,
  onCleanup,
  onMount,
  Show,
  useContext,
  type JSX,
  type ParentProps,
} from 'solid-js'
import {mapValues, memoize, once} from 'es-toolkit'
import {bundledLanguages, bundledLanguagesInfo} from 'shiki/langs'
import CodeXml from 'lucide-solid/icons/code-xml'
import {ReactiveMap} from '@solid-primitives/map'
import {Highlight} from '@conciv/ui-kit-system'
import {
  Streamdown,
  type FenceView,
  type FencedView,
  type HastElement,
  type HighlightCode,
  type LocalFileExists,
  type OpenLocalFile,
} from '@conciv/solid-streamdown'
import type {WorkerToMainMessage} from './highlight-shared.js'
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockTitle,
  CodeBlockViewport,
} from '../tools/styled/code-block.js'

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
  const pendingHighlights = new Set<string>()

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

const ensureBackend = once(createBackend)

export function warmHighlighter(): void {
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

function resolvedColor(element: HTMLElement, token: string): string {
  const probe = document.createElement('span')
  probe.style.color = `var(${token})`
  element.append(probe)
  const color = getComputedStyle(probe).color
  probe.remove()
  return color
}

function diagramStyle(element: HTMLElement): DiagramStyle {
  const computed = getComputedStyle(element)
  const themeVariables = mapValues(DIAGRAM_TOKENS, (token) => resolvedColor(element, token))
  return {darkMode: computed.colorScheme.trim() === 'dark', fontFamily: computed.fontFamily, themeVariables}
}

async function renderDiagram(id: string, source: string, style: DiagramStyle): Promise<string> {
  const {default: mermaid} = await import('mermaid')
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    fontFamily: style.fontFamily,
    theme: 'base',
    themeVariables: {...style.themeVariables, darkMode: style.darkMode, fontFamily: style.fontFamily},
  })
  const {svg} = await mermaid.render(id, source)
  return svg
}

type DiagramState = {status: 'drawing'} | {status: 'drawn'; svg: string} | {status: 'source'}

function MermaidDiagram(props: {code: string}): JSX.Element {
  const id = `conciv-diagram-${createUniqueId()}`
  const [diagram, setDiagram] = createSignal<DiagramState>({status: 'drawing'})
  const drawn = createMemo(() => {
    const current = diagram()
    return current.status === 'drawn' ? current.svg : undefined
  })
  let source: HTMLPreElement | undefined
  onMount(() => {
    if (!source) return setDiagram({status: 'source'})
    const style = diagramStyle(source)
    const key = cacheKey(`mermaid:${JSON.stringify(style)}`, props.code)
    const cached = diagrams.entries.get(key)
    if (cached !== undefined) return setDiagram({status: 'drawn', svg: cached})
    void renderDiagram(id, props.code, style)
      .then((markup) => {
        diagrams.remember(key, markup)
        setDiagram({status: 'drawn', svg: markup})
      })
      .catch(() => setDiagram({status: 'source'}))
  })
  return (
    <Show
      when={drawn()}
      fallback={
        <pre
          ref={(element) => {
            source = element
          }}
          aria-busy={diagram().status === 'drawing' ? 'true' : undefined}
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

type HastChild = HastElement['children'][number]

type CodeToken = {content: string; style?: string}

type CodeLine = readonly CodeToken[]

type HighlightResult = {style?: string; lines: readonly CodeLine[]}

function cachedHighlight(language: string, code: string): HastElement | undefined {
  backendReadyTick()
  const active = ensureBackend()
  if (!active || !active.isSupported(language)) return undefined
  const exact = highlights.entries.get(cacheKey(language, code))
  if (exact) return exact
  active.requestHighlight(cacheKey(language, code), language, code, true)
  const prefix = latestStreamedCode.entries.get(language)
  if (prefix === undefined || !code.startsWith(prefix)) return undefined
  return highlights.entries.get(cacheKey(language, prefix))
}

function trimTrailingNewlines(text: string): string {
  return text.replace(/\n+$/, '')
}

function hastStyle(element: HastElement): string | undefined {
  const style = element.properties.style
  return typeof style === 'string' ? style : undefined
}

function hastText(node: HastChild): string {
  if (node.type === 'text') return node.value
  if (node.type !== 'element') return ''
  return node.children.map(hastText).join('')
}

function lineTokens(line: HastElement): CodeLine {
  return line.children.map((child) => ({
    content: hastText(child),
    ...(child.type === 'element' ? {style: hastStyle(child)} : {}),
  }))
}

function highlightedLines(pre: HastElement): readonly CodeLine[] {
  const code = pre.children.find((child): child is HastElement => child.type === 'element' && child.tagName === 'code')
  return (code?.children ?? []).flatMap((child) => (child.type === 'element' ? [lineTokens(child)] : []))
}

function rawLines(code: string): readonly CodeLine[] {
  return code.split('\n').map((line) => [{content: line}])
}

function lineText(line: CodeLine): string {
  return line.map((token) => token.content).join('')
}

function withRawRest(highlighted: readonly CodeLine[], raw: readonly CodeLine[]): readonly CodeLine[] {
  const shared = Math.min(highlighted.length, raw.length)
  const open = highlighted[shared - 1]
  const typed = raw[shared - 1]
  if (open === undefined || typed === undefined) return raw
  const rest = lineText(typed).slice(lineText(open).length)
  return [...highlighted.slice(0, shared - 1), rest ? [...open, {content: rest}] : open, ...raw.slice(shared)]
}

const STREAMED_CODE =
  'not-prose min-w-0 [--shiki-background:transparent] [&_pre]:m-0 [&_pre]:p-2 [&_pre]:whitespace-pre-wrap [&_pre]:[overflow-wrap:anywhere] [&_pre]:[font-family:var(--chat-mono)]'

function StreamedCodeRows(props: {result: HighlightResult}): JSX.Element {
  return (
    <div class={STREAMED_CODE}>
      <pre style={props.result.style}>
        <code>
          <Index each={props.result.lines}>
            {(line) => (
              <span class="block">
                <Show when={lineText(line()) !== ''} fallback={'\n'}>
                  <Index each={line()}>{(token) => <span style={token().style}>{token().content}</span>}</Index>
                </Show>
              </span>
            )}
          </Index>
        </code>
      </pre>
    </div>
  )
}

function StreamedCodeBody(props: {language: string; code: string}): JSX.Element {
  const code = createMemo(() => trimTrailingNewlines(props.code))
  const raw = createMemo(() => rawLines(code()))
  const cached = createMemo(() => cachedHighlight(props.language, code()))
  const highlighted = createMemo(() => {
    const pre = cached()
    return pre && {style: hastStyle(pre), lines: highlightedLines(pre)}
  })
  const result = createMemo((): HighlightResult => {
    const current = highlighted()
    return current ? {style: current.style, lines: withRawRest(current.lines, raw())} : {lines: raw()}
  })
  return <StreamedCodeRows result={result()} />
}

export type MarkdownProps = {
  content: string
  streaming?: boolean
  compact?: boolean
  highlight?: readonly string[]
}

const NO_LINK_PREFIXES: string[] = []

const PROSE = 'prose-chat [&>[data-code-surface]]:my-2'

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

export type MarkdownCodeBlock = {
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

function RenderedFenceContent(props: {language: string; code: string; fallback: () => void}): JSX.Element {
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
  <RenderedFenceContent language={language} code={props.code} fallback={props.fallback} />
))

function highlightableLanguage(language: string): string {
  return Object.hasOwn(bundledLanguages, language) ? language : 'text'
}

const MarkdownStreamingContext = createContext<() => boolean>(() => false)

function languageName(language: string): string {
  if (!language) return 'Text'
  const known = bundledLanguagesInfo.find((info) => info.id === language || info.aliases?.includes(language))
  return known?.name ?? language
}

function FenceCard(props: {language: string; code: string}): JSX.Element {
  const streaming = useContext(MarkdownStreamingContext)
  const title = () => languageName(props.language)
  const code = () => fenceCode(props.code)
  return (
    <CodeBlock label={title()} text={code()} maxHeight="log">
      <CodeBlockHeader>
        <CodeBlockTitle icon={<CodeXml class="shrink-0 size-3.5" aria-hidden="true" />}>{title()}</CodeBlockTitle>
        <CodeBlockActions>
          <CodeBlockCopyButton />
        </CodeBlockActions>
      </CodeBlockHeader>
      <Show
        when={streaming()}
        fallback={
          <CodeBlockContent
            file={{name: props.language || 'text', lang: highlightableLanguage(props.language), contents: code()}}
          />
        }
      >
        <CodeBlockViewport>
          <StreamedCodeBody language={props.language} code={props.code} />
        </CodeBlockViewport>
      </Show>
    </CodeBlock>
  )
}

const sharedFenceView = memoize((language: string): FenceView => (props) => (
  <FenceCard language={language} code={props.code} />
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
  const streaming = () => props.streaming === true
  const fenceFallback = (language: string): FencedView['fallback'] => {
    if (language !== 'mermaid') return sharedFenceView(language)
    return streaming() ? undefined : MermaidDiagram
  }
  const highlightCode: HighlightCode = (_code, lang) => {
    const language = fenceLanguage(lang)
    const fallback = fenceFallback(language)
    if (streaming() || !markdown?.codeBlocks?.current().render.has(language)) return fallback
    return {view: codeBlockView(language), fallback}
  }
  return (
    <MarkdownStreamingContext.Provider value={streaming}>
      <Streamdown
        class={props.streaming ? `${PROSE} chat-caret-live` : PROSE}
        isAnimating={props.streaming === true}
        caret={props.streaming ? 'block' : false}
        highlightCode={highlightCode}
        highlight={props.highlight}
        openLocalFile={markdown?.openLocalFile}
        localFileExists={markdown?.localFileExists}
      >
        {props.content}
      </Streamdown>
    </MarkdownStreamingContext.Provider>
  )
}
