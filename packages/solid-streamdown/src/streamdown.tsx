import {createMemo, createResource, Index, type JSX, Match, Switch} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {unified, type Pluggable} from 'unified'
import type {Element, ElementContent, Root, RootContent} from 'hast'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import remarkGfm from 'remark-gfm'
import remend, {type RemendOptions} from 'remend'
import {harden} from 'rehype-harden'
import {parseMarkdownIntoBlocks} from './parse-blocks.js'
import {createAnimatePlugin, type AnimatePlugin} from './animate.js'

// Host-supplied highlighter (e.g. the widget's shiki) → full HTML for a code block. Keeps us shiki-agnostic.
export type HighlightCode = (code: string, lang: string | undefined) => string

export type CaretVariant = 'block' | 'circle'

// Caret glyphs (leading space). Rendered as ::after content on the last block element (styles.css),
// so it sits inline on the text baseline — never inside an animating token, never duplicated.
const carets: Record<CaretVariant, string> = {block: ' ▋', circle: ' ●'}
const codeFencePattern = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/

// Raw-HTML plugins are loaded lazily (rehype-raw bundles parse5, ~60KB gzip) so the base bundle
// stays lean — only consumers passing allowRawHtml pay for it. Cached after first load.
let rawPluginsCache: Promise<Pluggable[]> | undefined
function loadRawPlugins(): Promise<Pluggable[]> {
  rawPluginsCache ??= Promise.all([import('rehype-raw'), import('rehype-sanitize')]).then(([raw, san]) => {
    // Keep code-fence language-* classes through sanitization (for the host highlighter).
    const schema = {
      ...san.defaultSchema,
      attributes: {
        ...san.defaultSchema.attributes,
        code: [...(san.defaultSchema.attributes?.code ?? []), ['className', /^language-./]],
      },
    }
    return [raw.default, [san.default, schema]]
  })
  return rawPluginsCache
}

export type StreamdownProps = {
  children: string
  animated?: boolean // enables token fade-in support (default true)
  isAnimating?: boolean // true only while new content is actively streaming
  caret?: CaretVariant | boolean // caret glyph on the last block while streaming; true === 'block'
  parseIncompleteMarkdown?: boolean // self-heal unterminated markdown via remend (default true)
  remendOptions?: RemendOptions
  allowRawHtml?: boolean // render+sanitize raw HTML (default false; lazily pulls in parse5)
  allowedLinkPrefixes?: string[] // URL prefixes harden permits on links (default ['*'])
  allowedImagePrefixes?: string[] // URL prefixes harden permits on images (default ['*'])
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

// Fine-grained HAST → Solid renderer. Reactive getters mean only changed text/attrs update; existing
// DOM nodes are reused (Index keys by position), so re-parsing the growing last block never remounts
// already-shown tokens — the key to flicker-free streaming in Solid (no vdom diff to fall back on).
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

  // Map HAST properties to Solid attributes reactively (className → class).
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
      // Custom components get the raw node + highlighter; native tags must not leak these as attributes.
      node={isCustom() ? props.node() : undefined}
      highlightCode={isCustom() ? props.highlightCode : undefined}
    >
      <Index each={props.node().children}>
        {(child) => <HastNode node={child} components={props.components} highlightCode={props.highlightCode} />}
      </Index>
    </Dynamic>
  )
}

// pre (block code) → host highlighter when present and not mid-fade; otherwise plain <pre>.
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

// One block. createMemo on text means only the growing last block re-parses per streamed token;
// completed blocks keep stable text → stable DOM.
function Block(props: {
  text: string
  animate: boolean
  plugin: AnimatePlugin
  allowRawHtml: boolean
  highlightCode: HighlightCode | undefined
  linkPrefixes: string[]
  imagePrefixes: string[]
}): JSX.Element {
  // rehype-raw + sanitize load lazily (parse5 ~60KB) only when allowRawHtml.
  const [rawPlugins] = createResource(
    () => props.allowRawHtml,
    (on) => (on ? loadRawPlugins() : []),
  )

  // The animate plugin is in the pipeline only while animating — otherwise blocks render as clean
  // static markup (no fade spans), matching the source.
  const processor = createMemo(() => {
    const hardenPlugin: Pluggable = [
      harden,
      {allowedLinkPrefixes: props.linkPrefixes, allowedImagePrefixes: props.imagePrefixes},
    ]
    return unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype, {allowDangerousHtml: true})
      .use([...(rawPlugins() ?? []), hardenPlugin, ...(props.animate ? [props.plugin.rehypePlugin] : [])])
  })

  const hast = createMemo(() => {
    const p = processor()
    // Carry the previous run's char count so already-shown tokens skip the fade (duration:0ms).
    props.plugin.setPrevContentLength(props.plugin.getLastRenderCharCount())
    return p.runSync(p.parse(props.text)) as Root
  })

  return <HastNode node={hast} components={/*@once*/ STABLE_COMPONENTS as any} highlightCode={props.highlightCode} />
}

function normalizeCaret(caret: StreamdownProps['caret']): CaretVariant | undefined {
  if (caret === true) return 'block'
  return caret || undefined
}

// Hide the caret where a baseline glyph lands oddly: an unclosed code fence or a table in the last block.
function hideCaret(lastBlock: string | undefined): boolean {
  if (!lastBlock) return false
  if (findIncompleteCodeFence(lastBlock)) return true
  return /^\s*\|.*\|/m.test(lastBlock)
}

// Streaming-markdown renderer: per-block memoization (only the growing last block re-parses) + token fade-in.
export function Streamdown(props: StreamdownProps): JSX.Element {
  // One persistent animate plugin per block index, so prevContentLength survives the block's re-renders.
  const plugins = new Map<number, AnimatePlugin>()
  const pluginFor = (index: number): AnimatePlugin => {
    let p = plugins.get(index)
    if (!p) {
      p = createAnimatePlugin()
      plugins.set(index, p)
    }
    return p
  }

  // remend heals unterminated markdown before splitting so partial **bold/`code`/```fences render final.
  const blocks = createMemo(() => {
    const src = props.children ?? ''
    const healed = props.parseIncompleteMarkdown === false ? src : remend(src, props.remendOptions)
    return parseMarkdownIntoBlocks(healed).filter((b) => b.trim())
  })

  const shouldAnimate = () => props.animated !== false && props.isAnimating === true

  // Caret glyph rides a CSS var; styles.css renders it via `.sd-root > *:last-child::after` — on the
  // last block element's pseudo, inline at the text baseline, off any animating span.
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
