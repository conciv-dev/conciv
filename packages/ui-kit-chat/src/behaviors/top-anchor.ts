type TopAnchorTurnMessage = {readonly id: string; readonly role: string}

export function getActiveTopAnchorTurn(args: {
  isRunning: boolean
  messages: readonly TopAnchorTurnMessage[]
}): {anchorId: string; targetId: string} | null {
  if (!args.isRunning) return null
  const target = args.messages.at(-1)
  const anchor = args.messages.at(-2)
  if (anchor?.role !== 'user' || target?.role !== 'assistant') return null
  return {anchorId: anchor.id, targetId: target.id}
}

export function parseCssLength(value: string, element: HTMLElement): number {
  const match = value.trim().match(/^(\d+(?:\.\d+)?|\.\d+)(em|px|rem)$/)
  if (!match) return Number.POSITIVE_INFINITY
  const amount = Number(match[1])
  const unit = match[2]
  if (unit === 'px') return amount
  if (unit === 'em') return amount * (Number.parseFloat(getComputedStyle(element).fontSize) || 16)
  if (unit === 'rem') return amount * (Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16)
  return Number.POSITIVE_INFINITY
}

export function createReserveElement(): HTMLElement {
  const reserve = document.createElement('div')
  reserve.dataset.chatTopAnchorReserve = ''
  reserve.style.height = '0px'
  reserve.style.flexShrink = '0'
  reserve.style.pointerEvents = 'none'
  reserve.setAttribute('aria-hidden', 'true')
  return reserve
}

export function setReserveHeight(reserve: HTMLElement, height: number): boolean {
  const next = `${height}px`
  if (reserve.style.height !== next) {
    reserve.style.height = next
    return true
  }
  return false
}

export function snapScrollTop(top: number): number {
  const ratio = window.devicePixelRatio || 1
  return Math.round(top * ratio) / ratio
}

function getDocumentOffsetTop(element: HTMLElement): number {
  let top = 0
  let current: HTMLElement | null = element
  while (current) {
    top += current.offsetTop
    const next: Element | null = current.offsetParent
    current = next instanceof HTMLElement ? next : null
  }
  return top
}

function getLayoutOffsetTop(element: HTMLElement, ancestor: HTMLElement): number {
  let top = 0
  let current: HTMLElement | null = element
  while (current && current !== ancestor) {
    top += current.offsetTop
    const next: Element | null = current.offsetParent
    current = next instanceof HTMLElement ? next : null
  }
  if (current === ancestor) return top
  return getDocumentOffsetTop(element) - getDocumentOffsetTop(ancestor)
}

export type TopAnchorTarget = {viewport: HTMLElement; anchor: HTMLElement; tallerThan: number; visibleHeight: number}

export function computeTopAnchorTargetScrollTop(options: TopAnchorTarget): number {
  const anchorTop = getLayoutOffsetTop(options.anchor, options.viewport)
  const anchorHeight = options.anchor.offsetHeight
  const visibleAnchorHeight = anchorHeight <= options.tallerThan ? anchorHeight : options.visibleHeight
  return anchorTop + Math.max(0, anchorHeight - visibleAnchorHeight)
}

export function computeTopAnchorReserve(options: TopAnchorTarget & {reserve: HTMLElement}): number {
  const targetScrollTop = computeTopAnchorTargetScrollTop(options)
  const targetScrollHeight = targetScrollTop + options.viewport.clientHeight
  const scrollHeight = options.viewport.scrollHeight - options.reserve.offsetHeight
  return Math.max(0, targetScrollHeight - scrollHeight)
}

export function createReserveObservers(onChange: () => void): {
  observe: (viewport: HTMLElement, anchor: HTMLElement, target: HTMLElement) => void
  disconnect: () => void
} {
  const resizeObserver = new ResizeObserver(onChange)
  const mutationObserver = new MutationObserver(onChange)
  let observed: {viewport: HTMLElement; anchor: HTMLElement; target: HTMLElement} | null = null
  const disconnect = () => {
    resizeObserver.disconnect()
    mutationObserver.disconnect()
    observed = null
  }
  return {
    observe: (viewport, anchor, target) => {
      if (observed && observed.viewport === viewport && observed.anchor === anchor && observed.target === target) return
      disconnect()
      resizeObserver.observe(viewport)
      resizeObserver.observe(anchor)
      resizeObserver.observe(target)
      mutationObserver.observe(target, {childList: true, subtree: true, characterData: true})
      observed = {viewport, anchor, target}
    },
    disconnect,
  }
}
