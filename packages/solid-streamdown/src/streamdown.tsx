import {createMemo, Index, type JSX, Match, Switch} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {unified, type Pluggable} from 'unified'
import type {Element, ElementContent, Root, RootContent} from 'hast'
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

function codeText(node: Element | undefined): string {
  const child = node?.children?.[0]
  return child && child.type === 'text' ? child.value : ''
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
  node: () => Root | ElementContent | RootContent
  components: Record<string, (props: any) => JSX.Element>
  highlightCode?: HighlightCode
}): JSX.Element {
  return (
    <Switch>
      <Match when={props.node().type === 'text'}>{(props.node() as {value: string}).value}</Match>
      <Match when={props.node().type === 'element'}>
        <HastElement
          node={props.node as () => Element}
          components={props.components}
          highlightCode={props.highlightCode}
        />
      </Match>
      <Match when={props.node().type === 'root'}>
        <Index each={(props.node() as Root).children}>
          {(child) => <HastNode node={child} components={props.components} highlightCode={props.highlightCode} />}
        </Index>
      </Match>
    </Switch>
  )
}

function HastElement(props: {
  node: () => Element
  components: Record<string, (props: any) => JSX.Element>
  highlightCode?: HighlightCode
}): JSX.Element {
  const component = () => props.components[props.node().tagName] || props.node().tagName
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
  node?: Element
  children?: JSX.Element
  class?: string
  highlightCode?: HighlightCode
}): JSX.Element => {
  const codeNode = createMemo(() =>
    props.node?.children.find((c: ElementContent): c is Element => c.type === 'element' && c.tagName === 'code'),
  )
  return (
    <Switch fallback={<pre class={props.class}>{props.children}</pre>}>
      <Match when={props.highlightCode && codeNode()}>
        {(node) => <div innerHTML={props.highlightCode!(codeText(node()), codeLang(node().properties?.className))} />}
      </Match>
    </Switch>
  )
}

const Code = (props: {class?: string; children?: JSX.Element}): JSX.Element => (
  <code class={props.class}>{props.children}</code>
)

const STABLE_COMPONENTS = {pre: Pre, code: Code}

function Block(props: {
  text: string
  animate: boolean
  plugin: AnimatePlugin
  allowRawHtml: boolean
  highlightCode: HighlightCode | undefined
  linkPrefixes: string[]
  imagePrefixes: string[]
}): JSX.Element {
  const processor = createMemo(() => {
    const hardenPlugin: Pluggable = [
      harden,
      {allowedLinkPrefixes: props.linkPrefixes, allowedImagePrefixes: props.imagePrefixes},
    ]
    return unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype, {allowDangerousHtml: true})
      .use([
        ...(props.allowRawHtml ? rawPlugins : []),
        hardenPlugin,
        ...(props.animate ? [props.plugin.rehypePlugin] : []),
      ])
  })

  const hast = createMemo(() => {
    const p = processor()

    props.plugin.setPrevContentLength(props.plugin.getLastRenderCharCount())
    return p.runSync(p.parse(props.text)) as Root
  })

  return <HastNode node={hast} components={STABLE_COMPONENTS as any} highlightCode={props.highlightCode} />
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
            linkPrefixes={props.allowedLinkPrefixes ?? ['*']}
            imagePrefixes={props.allowedImagePrefixes ?? ['*']}
          />
        )}
      </Index>
    </div>
  )
}
