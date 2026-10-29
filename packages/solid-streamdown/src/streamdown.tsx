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

export type FenceView = (props: {code: string}) => JSX.Element

export type HighlightCode = (code: string, lang: string | undefined) => HastElement | FenceView | undefined

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
type MarkdownViewNode = {key: string; type: 'view'; code: string; view: FenceView}
type MarkdownNode = MarkdownElementNode | MarkdownTextNode | MarkdownWordNode | MarkdownViewNode

type HastRoot = ReturnType<MarkdownProcessor['runSync']>
type HastText = {type: 'text'; value: string}
type HastLiteral = {type: 'comment' | 'raw'; value: string}
export type HastElement = {
  type: 'element'
  tagName: string
  properties: Record<string, unknown>
  children: HastContent[]
}
type HastContent = HastElement | HastText | HastLiteral

type HastWalk = {words: boolean; animate: boolean; inlineCode: boolean; highlightCode: HighlightCode | undefined}

function elementAttributes(properties: Record<string, unknown>): Record<string, unknown> {
  const {className, ...rest} = properties
  if (className === undefined || className === null) return rest
  return {...rest, class: Array.isArray(className) ? className.join(' ') : className}
}

function hastText(node: HastContent): string {
  if (node.type === 'text') return node.value
  if (node.type !== 'element') return ''
  return node.children.map(hastText).join('')
}

function fenceCode(node: HastElement): HastElement | undefined {
  return node.children.find((child): child is HastElement => child.type === 'element' && child.tagName === 'code')
}

function highlightedFence(node: HastElement, path: string, walk: HastWalk): MarkdownNode[] | undefined {
  if (node.tagName !== 'pre' || !walk.highlightCode) return undefined
  const code = fenceCode(node)
  if (!code) return undefined
  const text = hastText(code)
  const result = walk.highlightCode(text, codeLang(elementAttributes(code.properties).class))
  if (typeof result === 'function') return [{key: `${path}:view`, type: 'view', code: text, view: result}]
  if (!result) return undefined
  return hastNode(result, path, {...walk, highlightCode: undefined})
}

function textNodes(node: HastText, path: string, walk: HastWalk): MarkdownNode[] {
  if (!walk.words) return [{key: path, type: 'text', text: node.value}]
  const parts = walk.inlineCode ? Array.from(node.value) : node.value.split(/(\s+)/)
  return parts.flatMap((text, index): MarkdownNode[] => {
    if (!text) return []
    if (/^\s+$/.test(text)) return [{key: `${path}:${index}`, type: 'text', text}]
    return [{key: `${path}:${index}`, type: 'word', text, ...(walk.animate ? {animate: true as const} : {})}]
  })
}

function hastNode(node: HastContent, path: string, walk: HastWalk): MarkdownNode[] {
  if (node.type === 'text') return textNodes(node, path, walk)
  if (node.type !== 'element') return []
  const fence = highlightedFence(node, path, walk)
  if (fence) return fence
  const isInlineCode = walk.words && node.tagName === 'code'
  const childWalk = {
    ...walk,
    words: walk.words && node.tagName !== 'pre',
    inlineCode: walk.inlineCode || isInlineCode,
  }
  return [
    {
      key: `${path}:${node.tagName}`,
      type: 'element',
      tag: node.tagName,
      attributes: elementAttributes(node.properties),
      children: node.children.flatMap((child, index) => hastNode(child, `${path}.${index}`, childWalk)),
      ...(walk.animate && isInlineCode ? {animate: true as const} : {}),
    },
  ]
}

function hastToMarkdownNodes(root: HastRoot, walk: HastWalk): MarkdownNode[] {
  return root.children.flatMap((node, index) => (node.type === 'doctype' ? [] : hastNode(node, `${index}`, walk)))
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

function MarkdownElement(props: {node: MarkdownElementNode}): JSX.Element {
  return (
    <Dynamic
      component={props.node.tag}
      ref={(element: HTMLElement) => markEntering(element, props.node.animate)}
      {...props.node.attributes}
    >
      <For each={props.node.children}>{(child) => <MarkdownDomNode node={child} />}</For>
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

function asView(node: MarkdownNode): MarkdownViewNode | undefined {
  return node.type === 'view' ? node : undefined
}

function MarkdownDomNode(props: {node: MarkdownNode}): JSX.Element {
  return (
    <Switch>
      <Match when={asText(props.node)}>{(node) => <HastText value={node().text} />}</Match>
      <Match when={asWord(props.node)}>{(node) => <MarkdownWord node={node()} />}</Match>
      <Match when={asElement(props.node)}>{(node) => <MarkdownElement node={node()} />}</Match>
      <Match when={asView(props.node)}>{(node) => <Dynamic component={node().view} code={node().code} />}</Match>
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
  const parsed = createMemo(
    on(
      () => props.processor.runSync(props.processor.parse(props.text)),
      (root, previous) => ({
        root,
        words: props.streaming,
        animate: previous ? props.streaming : props.enter,
      }),
    ),
  )
  const [nodes, setNodes] = createStore<MarkdownNode[]>([])
  createComputed(() => {
    const {root, words, animate} = parsed()
    setNodes(
      reconcile(hastToMarkdownNodes(root, {words, animate, inlineCode: false, highlightCode: props.highlightCode}), {
        key: 'key',
      }),
    )
  })
  return <For each={nodes}>{(node) => <MarkdownDomNode node={node} />}</For>
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
