import type {Element, Node, Parent, Root, Text} from 'hast'
import type {Pluggable} from 'unified'
import {SKIP, visitParents} from 'unist-util-visit-parents'

export type AnimatePlugin = {
  name: 'animate'
  type: 'animate'
  rehypePlugin: Pluggable

  setPrevContentLength: (length: number) => void

  getLastRenderCharCount: () => number
}

export type AnimateOptions = {
  animation?: 'fadeIn' | 'blurIn' | 'slideUp' | (string & {})
  duration?: number
  easing?: string
  sep?: 'word' | 'char'
  stagger?: number

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

function makeSpan(
  word: string,
  animation: string,
  duration: number,
  easing: string,
  skipAnimation: boolean,
  delay: number,
): Element {
  let style = `--sd-animation:sd-${animation};--sd-duration:${skipAnimation ? 0 : duration}ms;--sd-easing:${easing}`
  if (delay) style += `;--sd-delay:${delay}ms`
  return {
    type: 'element',
    tagName: 'span',
    properties: {'data-sd-animate': true, style},
    children: [{type: 'text', value: word}],
  }
}

type AnimateConfig = {
  animation: string
  duration: number
  easing: string
  sep: 'word' | 'char'
  stagger: number
  maxStagger: number
}

type RenderState = {lastRenderCharCount: number; prevContentLength: number}

function processTextNode(
  node: Text,
  ancestors: Node[],
  config: AnimateConfig,
  state: RenderState,
  counter: {count: number; newIndex: number},
): number | typeof SKIP | undefined {
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
    easing: options?.easing ?? 'cubic-bezier(0.22, 1, 0.36, 1)',
    sep: options?.sep ?? 'word',

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
