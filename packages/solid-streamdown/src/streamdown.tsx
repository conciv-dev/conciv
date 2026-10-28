import {
  createComputed,
  createMemo,
  createRenderEffect,
  For,
  Index,
  type JSX,
  Match,
  on,
  onMount,
  Show,
  Switch,
} from 'solid-js'
import {createStore, reconcile} from 'solid-js/store'
import {Dynamic} from 'solid-js/web'
import {unified, type Pluggable} from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import remarkGfm from 'remark-gfm'
import remend, {type RemendOptions} from 'remend'
import {harden} from 'rehype-harden'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, {defaultSchema} from 'rehype-sanitize'
import {parseMarkdownIntoBlocks} from './parse-blocks.js'

export type HighlightCode = (code: string, lang: string | undefined) => string

export type CaretVariant = 'block' | 'circle'

const carets: Record<CaretVariant, string> = {block: ' ▋', circle: ' ●'}
const codeFencePattern = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/

const rawSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ['className', /^language-./]],
  },
}
const rawPlugins: Pluggable[] = [rehypeRaw, [rehypeSanitize, rawSchema]]
const defaultLinkPrefixes: string[] = ['*']
const defaultImagePrefixes: string[] = ['*']

export type StreamdownProps = {
  children: string
  animated?: boolean
  isAnimating?: boolean
  caret?: CaretVariant | boolean
  parseIncompleteMarkdown?: boolean
  remendOptions?: RemendOptions
  allowRawHtml?: boolean
  allowedLinkPrefixes?: string[]
  allowedImagePrefixes?: string[]
  highlightCode?: HighlightCode
  class?: string
}

type MarkdownElementNode = {
  key: string
  type: 'element'
  tag: string
  attributes: Record<string, unknown>
  children: MarkdownNode[]
  animate?: true
}
type MarkdownTextNode = {key: string; type: 'text'; text: string}
type MarkdownWordNode = {key: string; type: 'word'; text: string; animate?: true}
type MarkdownNode = MarkdownElementNode | MarkdownTextNode | MarkdownWordNode

type HastRoot = ReturnType<MarkdownProcessor['runSync']>
type HastElement = Extract<HastRoot['children'][number], {type: 'element'}>
type HastContent = HastElement['children'][number]

function elementAttributes(properties: Record<string, unknown>): Record<string, unknown> {
  const {className, ...rest} = properties
  if (className === undefined || className === null) return rest
  return {...rest, class: Array.isArray(className) ? className.join(' ') : className}
}

function hastNode(
  node: HastContent,
  path: string,
  words: boolean,
  animate: boolean,
  inlineCode: boolean,
): MarkdownNode[] {
  if (node.type === 'text') {
    if (!words) return [{key: path, type: 'text', text: node.value}]
    const parts = inlineCode ? Array.from(node.value) : node.value.split(/(\s+)/)
    return parts.flatMap((text, index): MarkdownNode[] => {
      if (!text) return []
      if (/^\s+$/.test(text)) return [{key: `${path}:${index}`, type: 'text', text}]
      return [{key: `${path}:${index}`, type: 'word', text, ...(animate ? {animate: true as const} : {})}]
    })
  }
  if (node.type !== 'element') return []
  const isInlineCode = words && node.tagName === 'code'
  const childWords = words && node.tagName !== 'pre'
  return [
    {
      key: `${path}:${node.tagName}`,
      type: 'element',
      tag: node.tagName,
      attributes: elementAttributes(node.properties),
      children: node.children.flatMap((child, index) =>
        hastNode(child, `${path}.${index}`, childWords, animate, inlineCode || isInlineCode),
      ),
      ...(animate && isInlineCode ? {animate: true as const} : {}),
    },
  ]
}

function hastToMarkdownNodes(root: HastRoot, words: boolean, animate: boolean): MarkdownNode[] {
  return root.children.flatMap((node, index) =>
    node.type === 'doctype' ? [] : hastNode(node, `${index}`, words, animate, false),
  )
}

function nodeText(node: MarkdownNode): string {
  if (node.type === 'element') return node.children.map(nodeText).join('')
  return node.text
}

function codeLang(className: unknown): string | undefined {
  return /language-(\w+)/.exec(typeof className === 'string' ? className : '')?.[1]
}

function findIncompleteCodeFence(markdown: string): boolean {
  const lines = markdown.split('\n')
  let openFenceChar: string | undefined
  let openFenceLength = 0
  for (const line of lines) {
    const match = codeFencePattern.exec(line)
    if (!match) continue
    const fence = match[1] ?? ''
    if (!openFenceChar) {
      openFenceChar = fence[0]
      openFenceLength = fence.length
      continue
    }
    if (fence[0] === openFenceChar && fence.length >= openFenceLength) {
      openFenceChar = undefined
      openFenceLength = 0
    }
  }
  return openFenceChar !== undefined
}

function HastText(props: {value: string}): JSX.Element {
  const node = document.createTextNode('')
  createRenderEffect(() => {
    node.data = props.value
  })
  return node
}

function markEntering(element: HTMLElement, animate: boolean | undefined): void {
  if (animate) element.setAttribute('data-sd-animate', '')
}

function MarkdownWord(props: {node: MarkdownWordNode}): JSX.Element {
  return (
    <span ref={(element) => markEntering(element, props.node.animate)} data-sd-word="">
      {props.node.text}
    </span>
  )
}

function codeChild(node: MarkdownElementNode): MarkdownElementNode | undefined {
  return node.children.find((child): child is MarkdownElementNode => child.type === 'element' && child.tag === 'code')
}

function HighlightedPre(props: {node: MarkdownElementNode; highlightCode: HighlightCode}): JSX.Element {
  return (
    <Show when={codeChild(props.node)} fallback={<MarkdownElement node={props.node} />}>
      {(code) => <div innerHTML={props.highlightCode(nodeText(code()), codeLang(code().attributes.class))} />}
    </Show>
  )
}

function MarkdownElement(props: {node: MarkdownElementNode; highlightCode?: HighlightCode}): JSX.Element {
  return (
    <Dynamic
      component={props.node.tag}
      ref={(element: HTMLElement) => markEntering(element, props.node.animate)}
      {...props.node.attributes}
    >
      <For each={props.node.children}>
        {(child) => <MarkdownDomNode node={child} highlightCode={props.highlightCode} />}
      </For>
    </Dynamic>
  )
}

function asText(node: MarkdownNode): MarkdownTextNode | undefined {
  return node.type === 'text' ? node : undefined
}

function asWord(node: MarkdownNode): MarkdownWordNode | undefined {
  return node.type === 'word' ? node : undefined
}

function asElement(node: MarkdownNode): MarkdownElementNode | undefined {
  return node.type === 'element' ? node : undefined
}

function MarkdownDomNode(props: {node: MarkdownNode; highlightCode?: HighlightCode}): JSX.Element {
  return (
    <Switch>
      <Match when={asText(props.node)}>{(node) => <HastText value={node().text} />}</Match>
      <Match when={asWord(props.node)}>{(node) => <MarkdownWord node={node()} />}</Match>
      <Match when={asElement(props.node)}>
        {(node) => (
          <Show
            when={node().tag === 'pre' && props.highlightCode}
            fallback={<MarkdownElement node={node()} highlightCode={props.highlightCode} />}
          >
            {(highlightCode) => <HighlightedPre node={node()} highlightCode={highlightCode()} />}
          </Show>
        )}
      </Match>
    </Switch>
  )
}

type MarkdownProcessorOptions = {
  allowRawHtml: boolean
  linkPrefixes: string[]
  imagePrefixes: string[]
}

function createMarkdownProcessor(options: MarkdownProcessorOptions) {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, {allowDangerousHtml: true})
    .use([
      ...(options.allowRawHtml ? rawPlugins : []),
      [harden, {allowedLinkPrefixes: options.linkPrefixes, allowedImagePrefixes: options.imagePrefixes}],
    ])
}

type MarkdownProcessor = ReturnType<typeof createMarkdownProcessor>

function Block(props: {
  text: string
  streaming: boolean
  enter: boolean
  processor: MarkdownProcessor
  highlightCode: HighlightCode | undefined
}): JSX.Element {
  const hast = createMemo(() => props.processor.runSync(props.processor.parse(props.text)))
  const [nodes, setNodes] = createStore<MarkdownNode[]>([])
  createComputed(
    on(hast, (root, previous) =>
      setNodes(
        reconcile(hastToMarkdownNodes(root, props.streaming, previous ? props.streaming : props.enter), {key: 'key'}),
      ),
    ),
  )
  return <For each={nodes}>{(node) => <MarkdownDomNode node={node} highlightCode={props.highlightCode} />}</For>
}

function normalizeCaret(caret: StreamdownProps['caret']): CaretVariant | undefined {
  if (caret === true) return 'block'
  return caret || undefined
}

function hideCaret(lastBlock: string | undefined): boolean {
  if (!lastBlock) return false
  if (findIncompleteCodeFence(lastBlock)) return true
  return /^\s*\|.*\|/m.test(lastBlock)
}

export function Streamdown(props: StreamdownProps): JSX.Element {
  const blocks = createMemo(() => {
    const source = props.children ?? ''
    const healed = props.parseIncompleteMarkdown === false ? source : remend(source, props.remendOptions)
    return parseMarkdownIntoBlocks(healed).filter((block) => block.trim())
  })

  const processor = createMemo(() =>
    createMarkdownProcessor({
      allowRawHtml: props.allowRawHtml === true,
      linkPrefixes: props.allowedLinkPrefixes ?? defaultLinkPrefixes,
      imagePrefixes: props.allowedImagePrefixes ?? defaultImagePrefixes,
    }),
  )

  const shouldAnimate = () => props.animated !== false && props.isAnimating === true
  let ready = false
  onMount(() => {
    ready = true
  })

  const caretStyle = (): JSX.CSSProperties => {
    const variant = normalizeCaret(props.caret)
    if (!variant || !props.isAnimating || hideCaret(blocks().at(-1))) return {}
    return {'--sd-caret': `"${carets[variant]}"`}
  }

  return (
    <div class={`sd-root${props.class ? ` ${props.class}` : ''}`} style={caretStyle()}>
      <Index each={blocks()}>
        {(block) => (
          <Block
            text={block()}
            streaming={shouldAnimate()}
            enter={ready && shouldAnimate()}
            processor={processor()}
            highlightCode={props.highlightCode}
          />
        )}
      </Index>
    </div>
  )
}
