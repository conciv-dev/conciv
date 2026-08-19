import {type Accessor, createMemo, Index, type JSX, Match, Switch} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {createImmutable} from '@solid-primitives/immutable'
import {unified, type Pluggable} from 'unified'
import type {Root, RootContent} from 'hast'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import remarkGfm from 'remark-gfm'
import remend, {type RemendOptions} from 'remend'
import {harden} from 'rehype-harden'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, {defaultSchema} from 'rehype-sanitize'
import {parseMarkdownIntoBlocks} from './parse-blocks.js'
import {createAnimatePlugin, type AnimatePlugin} from './animate.js'

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
const hastImmutableOptions = {key: null, merge: true}

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

export type HastLikeNode = {
  type: string
  value?: string
  tagName?: string
  properties: Record<string, unknown>
  children: HastLikeNode[]
}

function normalizeHastNode(node: Root | RootContent): HastLikeNode {
  if (node.type === 'text') return {type: 'text', value: node.value, properties: {}, children: []}
  if (node.type === 'element') {
    return {
      type: 'element',
      tagName: node.tagName,
      properties: node.properties,
      children: node.children.map(normalizeHastNode),
    }
  }
  if (node.type === 'root') return {type: 'root', properties: {}, children: node.children.map(normalizeHastNode)}
  return {type: node.type, properties: {}, children: []}
}

function codeText(node: HastLikeNode | undefined): string {
  const child = node?.children[0]
  return child && child.type === 'text' ? (child.value ?? '') : ''
}

function codeLang(className: unknown): string | undefined {
  const cls = Array.isArray(className) ? className.join(' ') : typeof className === 'string' ? className : ''
  return /language-(\w+)/.exec(cls)?.[1]
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

function HastNode(props: {
  node: () => HastLikeNode
  components: Record<string, (props: any) => JSX.Element>
  highlightCode?: HighlightCode
}): JSX.Element {
  return (
    <Switch>
      <Match when={props.node().type === 'text'}>{props.node().value}</Match>
      <Match when={props.node().type === 'element'}>
        <HastElement node={props.node} components={props.components} highlightCode={props.highlightCode} />
      </Match>
      <Match when={props.node().type === 'root'}>
        <Index each={props.node().children}>
          {(child) => <HastNode node={child} components={props.components} highlightCode={props.highlightCode} />}
        </Index>
      </Match>
    </Switch>
  )
}

function HastElement(props: {
  node: () => HastLikeNode
  components: Record<string, (props: any) => JSX.Element>
  highlightCode?: HighlightCode
}): JSX.Element {
  const component = () => {
    const tagName = props.node().tagName ?? 'span'
    return props.components[tagName] || tagName
  }
  const isCustom = () => typeof component() === 'function'

  const attrs = createMemo(() => {
    const p: Record<string, unknown> = {...props.node().properties}
    if (p.className) {
      p.class = Array.isArray(p.className) ? p.className.join(' ') : p.className
      delete p.className
    }
    return p
  })

  return (
    <Dynamic
      component={component()}
      {...attrs()}
      node={isCustom() ? props.node() : undefined}
      highlightCode={isCustom() ? props.highlightCode : undefined}
    >
      <Index each={props.node().children}>
        {(child) => <HastNode node={child} components={props.components} highlightCode={props.highlightCode} />}
      </Index>
    </Dynamic>
  )
}

const Pre = (props: {
  node?: HastLikeNode
  children?: JSX.Element
  class?: string
  highlightCode?: HighlightCode
}): JSX.Element => {
  const codeNode = createMemo(() => props.node?.children.find((c) => c.type === 'element' && c.tagName === 'code'))
  return (
    <Switch fallback={<pre class={props.class}>{props.children}</pre>}>
      <Match when={props.highlightCode && codeNode()}>
        {(node) => <div innerHTML={props.highlightCode!(codeText(node()), codeLang(node().properties.className))} />}
      </Match>
    </Switch>
  )
}

const Code = (props: {class?: string; children?: JSX.Element}): JSX.Element => (
  <code class={props.class}>{props.children}</code>
)

const STABLE_COMPONENTS = {pre: Pre, code: Code}

export type HastBuildProps = {
  text: string
  animate: boolean
  plugin: AnimatePlugin
  allowRawHtml: boolean
  linkPrefixes: string[]
  imagePrefixes: string[]
}

export function createHast(props: Accessor<HastBuildProps>): HastLikeNode {
  const processor = createMemo(() => {
    const current = props()
    const hardenPlugin: Pluggable = [
      harden,
      {allowedLinkPrefixes: current.linkPrefixes, allowedImagePrefixes: current.imagePrefixes},
    ]
    return unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype, {allowDangerousHtml: true})
      .use([
        ...(current.allowRawHtml ? rawPlugins : []),
        hardenPlugin,
        ...(current.animate ? [current.plugin.rehypePlugin] : []),
      ])
  })

  const rawHast = createMemo(() => {
    const p = processor()
    const current = props()

    current.plugin.setPrevContentLength(current.plugin.getLastRenderCharCount())
    const parsed = p.runSync(p.parse(current.text)) as Root
    return normalizeHastNode(parsed)
  })

  return createImmutable(() => rawHast(), hastImmutableOptions)
}

function Block(props: {
  text: string
  animate: boolean
  plugin: AnimatePlugin
  allowRawHtml: boolean
  highlightCode: HighlightCode | undefined
  linkPrefixes: string[]
  imagePrefixes: string[]
}): JSX.Element {
  const hast = createHast(() => props)

  return <HastNode node={() => hast} components={STABLE_COMPONENTS as any} highlightCode={props.highlightCode} />
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
  const plugins = new Map<number, AnimatePlugin>()
  const pluginFor = (index: number): AnimatePlugin => {
    let p = plugins.get(index)
    if (!p) {
      p = createAnimatePlugin()
      plugins.set(index, p)
    }
    return p
  }

  const blocks = createMemo(() => {
    const src = props.children ?? ''
    const healed = props.parseIncompleteMarkdown === false ? src : remend(src, props.remendOptions)
    return parseMarkdownIntoBlocks(healed).filter((b) => b.trim())
  })

  const shouldAnimate = () => props.animated !== false && props.isAnimating === true

  const caretStyle = (): JSX.CSSProperties => {
    const variant = normalizeCaret(props.caret)
    if (!variant || !props.isAnimating || hideCaret(blocks().at(-1))) return {}
    return {'--sd-caret': `"${carets[variant]}"`}
  }

  return (
    <div class={`sd-root${props.class ? ` ${props.class}` : ''}`} style={caretStyle()}>
      <Index each={blocks()}>
        {(block, index) => (
          <Block
            text={block()}
            animate={shouldAnimate()}
            plugin={pluginFor(index)}
            allowRawHtml={props.allowRawHtml === true}
            highlightCode={props.highlightCode}
            linkPrefixes={props.allowedLinkPrefixes ?? defaultLinkPrefixes}
            imagePrefixes={props.allowedImagePrefixes ?? defaultImagePrefixes}
          />
        )}
      </Index>
    </div>
  )
}
