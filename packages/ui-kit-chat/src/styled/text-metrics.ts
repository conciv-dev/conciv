import {
  clearCache,
  layout,
  measureNaturalWidth,
  prepareWithSegments,
  type PreparedTextWithSegments,
} from '@chenglou/pretext'
import type {Accessor} from 'solid-js'
import type {MessagePart} from '@tanstack/ai-client'
import {defaultGrouper, groupParts, type GroupNode, type Grouping, type Turn} from '../store/grouping.js'
import type {TurnEstimate, TurnEstimator} from '../primitives/thread/turn-estimate.js'
import {ASSISTANT_ROOT_CLASS, PROMPT_TEXT_CLASS} from './turn-classes.js'

const PROMPT_WIDTH_FRACTION = 0.94
const MARKDOWN_SYNTAX = /[*_~`#>[\]|]|\n\s*\n|(^|\n)\s*([-+]\s|\d+[.)]\s|-{3,})/
const COLLAPSED_CARD_APPROX_PX = 30
const SEGMENT_GAP_PX = 6

type RowStyle = {
  font: string
  letterSpacing: number
  whiteSpace: 'pre-wrap' | 'normal'
  wordBreak: 'keep-all' | 'normal'
  lineHeight: number
  maxWidth: number
  boxSizing: string
  padX: number
  padY: number
  borderX: number
  borderY: number
  extraY: number
}

type Metrics = {user: RowStyle; assistant: RowStyle; viewportPadX: number}

export type TurnEstimatorOptions = {
  grouping?: Accessor<Grouping | undefined>
  exactAllowed?: Accessor<boolean>
  disabled?: Accessor<boolean>
}

function num(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function readRowStyle(box: HTMLElement, textHolder: HTMLElement, extraY: number): RowStyle {
  const boxStyle = getComputedStyle(box)
  const textStyle = getComputedStyle(textHolder)
  const fontStyle = textStyle.fontStyle === 'normal' ? '' : `${textStyle.fontStyle} `
  const lineHeightRaw = textStyle.lineHeight
  const lineHeight = lineHeightRaw.endsWith('px')
    ? num(lineHeightRaw)
    : textHolder.getBoundingClientRect().height || num(textStyle.fontSize) * 1.2
  return {
    font: `${fontStyle}${textStyle.fontWeight} ${textStyle.fontSize} ${textStyle.fontFamily}`,
    letterSpacing: textStyle.letterSpacing === 'normal' ? 0 : num(textStyle.letterSpacing),
    whiteSpace: textStyle.whiteSpace === 'pre-wrap' ? 'pre-wrap' : 'normal',
    wordBreak: textStyle.wordBreak === 'keep-all' ? 'keep-all' : 'normal',
    lineHeight,
    maxWidth: boxStyle.maxWidth.endsWith('px') ? num(boxStyle.maxWidth) : Number.POSITIVE_INFINITY,
    boxSizing: boxStyle.boxSizing,
    padX: num(boxStyle.paddingLeft) + num(boxStyle.paddingRight),
    padY: num(boxStyle.paddingTop) + num(boxStyle.paddingBottom),
    borderX: num(boxStyle.borderLeftWidth) + num(boxStyle.borderRightWidth),
    borderY: num(boxStyle.borderTopWidth) + num(boxStyle.borderBottomWidth),
    extraY,
  }
}

function resolveMetrics(viewport: HTMLElement): Metrics {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:absolute;top:0;left:0;right:0;visibility:hidden;pointer-events:none;'

  const userBubble = document.createElement('span')
  userBubble.className = PROMPT_TEXT_CLASS
  const userText = document.createElement('span')
  userText.textContent = 'Probe'
  userBubble.appendChild(userText)

  const assistantRoot = document.createElement('div')
  assistantRoot.className = ASSISTANT_ROOT_CLASS
  const prose = document.createElement('div')
  prose.className = 'prose-chat'
  const paragraph = document.createElement('p')
  paragraph.textContent = 'Probe'
  prose.appendChild(paragraph)
  assistantRoot.appendChild(prose)

  probe.appendChild(userBubble)
  probe.appendChild(assistantRoot)
  viewport.appendChild(probe)

  const viewportStyle = getComputedStyle(viewport)
  const rootPadBottom = num(getComputedStyle(assistantRoot).paddingBottom)
  const metrics: Metrics = {
    user: readRowStyle(userBubble, userText, 0),
    assistant: readRowStyle(prose, paragraph, rootPadBottom),
    viewportPadX: num(viewportStyle.paddingLeft) + num(viewportStyle.paddingRight),
  }
  probe.remove()
  return metrics
}

function contentCap(style: RowStyle, containerWidth: number, fraction: number): number {
  const capOuter = Math.min(containerWidth * fraction, style.maxWidth)
  const chrome = style.padX + style.borderX
  return Math.max(1, style.boxSizing === 'border-box' ? capOuter - chrome : capOuter)
}

function stripMarkdown(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, 'x'))
    .replace(/[*_~`#>|]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
}

function textOf(part: MessagePart | undefined): string | undefined {
  return part?.type === 'text' ? part.content : undefined
}

export function createTurnEstimator(
  viewport: Accessor<HTMLElement | undefined>,
  options?: TurnEstimatorOptions,
): TurnEstimator {
  let metrics: Metrics | undefined
  const prepared = new Map<string, PreparedTextWithSegments>()
  const heights = new Map<string, TurnEstimate>()

  const prepare = (text: string, style: RowStyle): PreparedTextWithSegments => {
    const key = `${style.font} ${text}`
    const cached = prepared.get(key)
    if (cached) return cached
    const next = prepareWithSegments(text, style.font, {
      whiteSpace: style.whiteSpace,
      letterSpacing: style.letterSpacing,
      wordBreak: style.wordBreak,
    })
    prepared.set(key, next)
    return next
  }

  const textHeight = (text: string, style: RowStyle, containerWidth: number, shrinkFraction?: number): number => {
    const preparedText = prepare(text, style)
    const cap = contentCap(style, containerWidth, shrinkFraction ?? 1)
    const width = shrinkFraction === undefined ? cap : Math.min(measureNaturalWidth(preparedText), cap)
    return layout(preparedText, Math.max(1, width), style.lineHeight).height
  }

  const estimateUser = (turn: Turn, containerWidth: number): TurnEstimate | undefined => {
    const style = metrics?.user
    if (!style) return undefined
    if (!turn.parts.every((part) => part.type === 'text')) return undefined
    const bubbles = turn.parts.map(
      (part) =>
        textHeight(textOf(part) ?? '', style, containerWidth, PROMPT_WIDTH_FRACTION) + style.padY + style.borderY,
    )
    if (bubbles.length === 0) return undefined
    const height = bubbles.reduce((sum, bubble) => sum + bubble, 0) + SEGMENT_GAP_PX * (bubbles.length - 1)
    return {height, exact: bubbles.length === 1}
  }

  const estimateNode = (node: GroupNode, parts: MessagePart[], style: RowStyle, width: number) => {
    if (node.type === 'part') {
      const content = textOf(parts[node.index])
      if (content === undefined) return {height: COLLAPSED_CARD_APPROX_PX, exact: false}
      const plain = !MARKDOWN_SYNTAX.test(content)
      const text = plain ? content : stripMarkdown(content)
      return {height: textHeight(text, style, width), exact: plain}
    }
    return {height: COLLAPSED_CARD_APPROX_PX, exact: false}
  }

  const nodesFor = (turn: Turn): readonly GroupNode[] => {
    const grouping = options?.grouping?.()
    return groupParts(turn.parts, grouping?.grouper ?? defaultGrouper, grouping?.context ?? {})
  }

  const estimateAssistant = (turn: Turn, containerWidth: number): TurnEstimate | undefined => {
    const style = metrics?.assistant
    if (!style) return undefined
    const nodes = nodesFor(turn)
    if (nodes.length === 0) return undefined
    const estimates = nodes.map((node) => estimateNode(node, turn.parts, style, containerWidth))
    const content = estimates.reduce((sum, estimate) => sum + estimate.height, 0)
    return {
      height: style.extraY + SEGMENT_GAP_PX * (nodes.length - 1) + content,
      exact: nodes.length === 1 && estimates.every((estimate) => estimate.exact),
    }
  }

  const resolveContainerWidth = (): number | undefined => {
    const element = viewport()
    if (!element) return undefined
    metrics ??= resolveMetrics(element)
    const containerWidth = element.clientWidth - metrics.viewportPadX
    return containerWidth > 0 ? containerWidth : undefined
  }

  const computeEstimate = (turn: Turn, containerWidth: number): TurnEstimate | undefined => {
    if (turn.role === 'user') return estimateUser(turn, containerWidth)
    if (turn.role === 'assistant') return estimateAssistant(turn, containerWidth)
    return undefined
  }

  const applyExactPolicy = (estimate: TurnEstimate): TurnEstimate => {
    if (!estimate.exact) return estimate
    const allowExact = options?.exactAllowed?.() ?? true
    return allowExact ? estimate : {height: estimate.height, exact: false}
  }

  return {
    estimateTurn: (turn) => {
      if (options?.disabled?.()) return undefined
      const containerWidth = resolveContainerWidth()
      if (containerWidth === undefined) return undefined
      const cacheKey = `${turn.key} ${turn.role} ${containerWidth} ${turn.parts.length}`
      const cached = heights.get(cacheKey)
      if (cached) return cached
      const estimate = computeEstimate(turn, containerWidth)
      if (!estimate) return undefined
      const resolved = applyExactPolicy(estimate)
      heights.set(cacheKey, resolved)
      return resolved
    },
    reset: () => {
      metrics = undefined
      prepared.clear()
      heights.clear()
      clearCache()
    },
  }
}
