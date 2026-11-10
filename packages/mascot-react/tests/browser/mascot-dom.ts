import gsap from 'gsap'
import {onTestFinished} from 'vitest'

const DIGITS = ['0', '1']

export const DRAIN_TIMEOUT = {timeout: 3_000, interval: 30}

export const partsIn = (container: ParentNode, part: string): HTMLElement[] => [
  ...container.querySelectorAll<HTMLElement>(`[data-scope="mascot"][data-part="${part}"]`),
]

const hiddenSpansIn = (container: ParentNode): HTMLElement[] => [
  ...container.querySelectorAll<HTMLElement>('span[aria-hidden="true"]'),
]

const isDigit = (child: Element): boolean => DIGITS.includes(child.textContent ?? '')

const isEmitter = (element: HTMLElement): boolean =>
  element.childElementCount === 5 && [...element.children].every(isDigit)

export const emittersIn = (container: ParentNode): HTMLElement[] => hiddenSpansIn(container).filter(isEmitter)

export const leanWrappersIn = (container: ParentNode): HTMLElement[] =>
  hiddenSpansIn(container).filter(
    (element) => element.childElementCount === 1 && element.firstElementChild?.getAttribute('data-part') === 'antenna',
  )

export const ridersIn = (emitter: HTMLElement): Element[] =>
  [...emitter.children].filter((digit) => digit.firstElementChild !== null)

export const liveTweenCount = (): number => gsap.globalTimeline.getChildren(true, true, true).length

export function rootOf(container: ParentNode): HTMLElement {
  const root = partsIn(container, 'root')[0]
  if (root === undefined) throw new Error('the mascot root did not render')
  return root
}

export function partOf(container: ParentNode, part: string): HTMLElement {
  const element = partsIn(container, part)[0]
  if (element === undefined) throw new Error(`the mascot ${part} did not render`)
  return element
}

export function styleRule(rule: string): void {
  const sheet = document.createElement('style')
  sheet.textContent = rule
  document.head.append(sheet)
  onTestFinished(() => sheet.remove())
}
