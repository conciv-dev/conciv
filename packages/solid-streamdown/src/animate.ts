// Token fade-in rehype plugin, ported from Vercel's streamdown (Apache-2.0). See NOTICE.
// Wraps each word/char of every text node in a <span data-sd-animate> carrying per-token CSS vars.
// Already-shown tokens get --sd-duration:0ms so re-parsing the growing block never re-animates them.
import type {Element, Node, Parent, Root, Text} from 'hast'
import type {Pluggable} from 'unified'
import {SKIP, visitParents} from 'unist-util-visit-parents'

export type AnimatePlugin = {
  name: 'animate'
  type: 'animate'
  rehypePlugin: Pluggable
  // Char count from the previous run, used as prevContentLength on the next run.
  setPrevContentLength: (length: number) => void
  // Total text-node chars from the last run, then resets to 0.
  getLastRenderCharCount: () => number
}

export type AnimateOptions = {
  animation?: 'fadeIn' | 'blurIn' | 'slideUp' | (string & {})
  duration?: number
  easing?: string
  sep?: 'word' | 'char'
  stagger?: number
  // Upper bound on a token's stagger delay. Agents stream in large chunks (many new tokens in one
  // render); without a cap the per-token delay grows unbounded and the caret floats far ahead of the
  // still-invisible trailing tokens. Capping keeps any chunk fully faded within ~maxStagger+duration.
  maxStagger?: number
}

const WHITESPACE_RE = /\s/
const WHITESPACE_ONLY_RE = /^\s+$/
const SKIP_TAGS = new Set(['code', 'pre', 'svg', 'math', 'annotation'])

function isElement(node: unknown): node is Element {
  return typeof node === 'object' && node !== null && 'type' in node && (node as Element).type === 'element'
}

function hasSkipAncestor(ancestors: Node[]): boolean {
  return ancestors.some((a) => isElement(a) && SKIP_TAGS.has(a.tagName))
}

function splitByWord(text: string): string[] {
  const parts: string[] = []
  let current = ''
  let inWhitespace = false
  for (const char of text) {
    const isWs = WHITESPACE_RE.test(char)
    if (isWs !== inWhitespace && current) {
      parts.push(current)
      current = ''
    }
    current += char
    inWhitespace = isWs
  }
  if (current) parts.push(current)
  return parts
}

function splitByChar(text: string): string[] {
  const parts: string[] = []
  let wsBuffer = ''
  for (const char of text) {
    if (WHITESPACE_RE.test(char)) {
      wsBuffer += char
      continue
    }
    if (wsBuffer) {
      parts.push(wsBuffer)
      wsBuffer = ''
    }
    parts.push(char)
  }
  if (wsBuffer) parts.push(wsBuffer)
  return parts
}

function makeSpan(word: string, animation: string, duration: number, easing: string, skipAnimation: boolean, delay: number): Element {
  let style = `--sd-animation:sd-${animation};--sd-duration:${skipAnimation ? 0 : duration}ms;--sd-easing:${easing}`
  if (delay) style += `;--sd-delay:${delay}ms`
  return {type: 'element', tagName: 'span', properties: {'data-sd-animate': true, style}, children: [{type: 'text', value: word}]}
}

type AnimateConfig = {animation: string; duration: number; easing: string; sep: 'word' | 'char'; stagger: number; maxStagger: number}

// Persists for the plugin instance's lifetime; both the rehype closure and the API methods read it.
type RenderState = {lastRenderCharCount: number; prevContentLength: number}

function processTextNode(node: Text, ancestors: Node[], config: AnimateConfig, state: RenderState, counter: {count: number; newIndex: number}): number | typeof SKIP | undefined {
  const ancestor = ancestors.at(-1)
  if (!(ancestor && 'children' in ancestor)) return
  if (hasSkipAncestor(ancestors)) return SKIP

  const parent = ancestor as Parent
  const index = parent.children.indexOf(node)
  if (index === -1) return

  const text = node.value
  if (!text.trim()) {
    counter.count += text.length
    return
  }

  const parts = config.sep === 'char' ? splitByChar(text) : splitByWord(text)
  const prevLen = state.prevContentLength

  const nodes: (Element | Text)[] = parts.map((part) => {
    const partStart = counter.count
    counter.count += part.length
    if (WHITESPACE_ONLY_RE.test(part)) return {type: 'text', value: part} as Text
    // Already-visible chars (before prevLen) skip the fade so re-parsing never re-animates them.
    const skipAnimation = prevLen > 0 && partStart < prevLen
    const delay = skipAnimation ? 0 : Math.min(counter.newIndex++ * config.stagger, config.maxStagger)
    return makeSpan(part, config.animation, config.duration, config.easing, skipAnimation, delay)
  })

  parent.children.splice(index, 1, ...nodes)
  return index + nodes.length
}

export function createAnimatePlugin(options?: AnimateOptions): AnimatePlugin {
  const config: AnimateConfig = {
    animation: options?.animation ?? 'fadeIn',
    duration: options?.duration ?? 150,
    easing: options?.easing ?? 'ease',
    sep: options?.sep ?? 'word',
    // Default 0: tokens in a render fade UNIFORMLY, not sequentially. Sequential stagger floats the
    // caret over still-invisible (but layout-reserving) trailing tokens — worst on agents' big chunks.
    stagger: options?.stagger ?? 0,
    maxStagger: options?.maxStagger ?? 120,
  }
  const state: RenderState = {lastRenderCharCount: 0, prevContentLength: 0}

  const rehypePlugin: Pluggable = () => (tree: Root) => {
    const counter = {count: 0, newIndex: 0}
    visitParents(tree, 'text', (node: Text, ancestors) => processTextNode(node, ancestors, config, state, counter))
    state.lastRenderCharCount = counter.count
    state.prevContentLength = 0
  }

  return {
    name: 'animate',
    type: 'animate',
    rehypePlugin,
    setPrevContentLength(length: number) {
      state.prevContentLength = length
    },
    getLastRenderCharCount() {
      const count = state.lastRenderCharCount
      state.lastRenderCharCount = 0
      return count
    },
  }
}
