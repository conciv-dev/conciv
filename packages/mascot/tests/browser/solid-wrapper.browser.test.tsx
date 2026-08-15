import {createSignal, type JSX, Show} from 'solid-js'
import {render} from '@solidjs/testing-library'
import {expect, it} from 'vitest'
import gsap from 'gsap'
import {Mascot} from '../../src/solid/index.js'

const DIGITS = ['0', '1']

const partsIn = (container: HTMLElement, part: string): HTMLElement[] => [
  ...container.querySelectorAll<HTMLElement>(`[data-scope="mascot"][data-part="${part}"]`),
]

const hiddenSpansIn = (container: HTMLElement): HTMLElement[] => [
  ...container.querySelectorAll<HTMLElement>('span[aria-hidden="true"]'),
]

const isDigit = (child: Element): boolean => DIGITS.includes(child.textContent ?? '')

const isEmitter = (element: HTMLElement): boolean =>
  element.childElementCount === 5 && [...element.children].every(isDigit)

const emittersIn = (container: HTMLElement): HTMLElement[] => hiddenSpansIn(container).filter(isEmitter)

const leanWrappersIn = (container: HTMLElement): HTMLElement[] =>
  hiddenSpansIn(container).filter(
    (element) => element.childElementCount === 1 && element.firstElementChild?.getAttribute('data-part') === 'antenna',
  )

const ridersIn = (emitter: HTMLElement): Element[] =>
  [...emitter.children].filter((digit) => digit.firstElementChild !== null)

const liveTweenCount = (): number => gsap.globalTimeline.getChildren(true, true, true).length

const renderMascot = (view: () => JSX.Element): {container: HTMLElement; unmount: () => void} => {
  const mounted = render(view)
  return {container: mounted.container, unmount: mounted.unmount}
}

it('renders one head, one antenna and one eyes layer with no children at all', () => {
  const {container} = renderMascot(() => <Mascot />)
  expect(partsIn(container, 'head')).toHaveLength(1)
  expect(partsIn(container, 'antenna')).toHaveLength(1)
  expect(partsIn(container, 'eyes')).toHaveLength(1)
})

it('mounts the default binary emitter while the mascot works', () => {
  const {container} = renderMascot(() => <Mascot working />)
  expect(emittersIn(container)).toHaveLength(1)
})

it('replaces the default eyes layer with the eyes child', () => {
  const {container} = renderMascot(() => (
    <Mascot>
      <Mascot.Eyes id="consumer-eyes" />
    </Mascot>
  ))
  const eyes = partsIn(container, 'eyes')
  expect(eyes).toHaveLength(1)
  expect(eyes[0]?.id === 'consumer-eyes').toBe(true)
})

it('restores the default eyes layer when the eyes child unmounts', () => {
  const [visible, setVisible] = createSignal(true)
  const {container} = renderMascot(() => (
    <Mascot>
      <Show when={visible()}>
        <Mascot.Eyes id="consumer-eyes" />
      </Show>
    </Mascot>
  ))
  setVisible(false)
  const eyes = partsIn(container, 'eyes')
  expect(eyes).toHaveLength(1)
  expect(eyes[0]?.id === 'consumer-eyes').toBe(false)
})

it('keeps one eyes layer and one lean wrapper through repeated child churn', () => {
  const [visible, setVisible] = createSignal(true)
  const {container} = renderMascot(() => (
    <Mascot>
      <Show when={visible()}>
        <Mascot.Eyes id="consumer-eyes" />
      </Show>
    </Mascot>
  ))
  for (let round = 0; round < 5; round += 1) {
    setVisible(false)
    setVisible(true)
  }
  expect(partsIn(container, 'eyes')).toHaveLength(1)
  expect(leanWrappersIn(container)).toHaveLength(1)
})

it('keeps a single emitter across a working flap', () => {
  const [working, setWorking] = createSignal(true)
  const {container} = renderMascot(() => <Mascot working={working()} />)
  setWorking(false)
  setWorking(true)
  expect(emittersIn(container)).toHaveLength(1)
})

it('binds every part when the children are given in another order', () => {
  const {container} = renderMascot(() => (
    <Mascot>
      <Mascot.Eyes />
      <Mascot.Antenna />
      <Mascot.Head />
    </Mascot>
  ))
  expect(partsIn(container, 'head')).toHaveLength(1)
  expect(partsIn(container, 'antenna')).toHaveLength(1)
  expect(partsIn(container, 'eyes')).toHaveLength(1)
  expect(leanWrappersIn(container)).toHaveLength(1)
})

it('mounts one emitter per effect child instead of the default one', () => {
  const {container} = renderMascot(() => (
    <Mascot working>
      <Mascot.Binary />
      <Mascot.Binary />
    </Mascot>
  ))
  expect(emittersIn(container)).toHaveLength(2)
})

it('flies the digits along curve riders when the effect child asks for a curve', () => {
  const curved = renderMascot(() => (
    <Mascot working>
      <Mascot.Binary curve="arc" />
    </Mascot>
  ))
  const straight = renderMascot(() => (
    <Mascot working>
      <Mascot.Binary />
    </Mascot>
  ))
  const curvedEmitter = emittersIn(curved.container)[0]
  const straightEmitter = emittersIn(straight.container)[0]
  expect(curvedEmitter === undefined ? [] : ridersIn(curvedEmitter)).toHaveLength(5)
  expect(straightEmitter === undefined ? [] : ridersIn(straightEmitter)).toHaveLength(0)
})

it('leaves no emitter and no live tween behind after five rapid mounts', () => {
  const before = liveTweenCount()
  for (let round = 0; round < 5; round += 1) {
    const mounted = renderMascot(() => <Mascot working />)
    expect(emittersIn(mounted.container)).toHaveLength(1)
    mounted.unmount()
    expect(emittersIn(mounted.container)).toHaveLength(0)
  }
  expect(liveTweenCount()).toBe(before)
})
