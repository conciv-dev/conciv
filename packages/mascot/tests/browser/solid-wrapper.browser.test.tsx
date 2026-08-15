import {createSignal, type JSX, Show} from 'solid-js'
import {render} from '@solidjs/testing-library'
import {page} from 'vitest/browser'
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

const rootOf = (container: HTMLElement): HTMLElement => {
  const root = partsIn(container, 'root')[0]
  if (root === undefined) throw new Error('the mascot root did not render')
  return root
}

const partOf = (container: HTMLElement, part: string): HTMLElement => {
  const element = partsIn(container, part)[0]
  if (element === undefined) throw new Error(`the mascot ${part} did not render`)
  return element
}

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })

const DRAIN_MS = 900

const SIZING_CLASS = 'tall-mascot'

const styleRule = (rule: string): void => {
  const sheet = document.createElement('style')
  sheet.textContent = rule
  document.head.append(sheet)
}

it('renders one head, one antenna and one eyes layer on a stage with a real size', () => {
  const {container} = renderMascot(() => <Mascot />)
  expect(partsIn(container, 'head')).toHaveLength(1)
  expect(partsIn(container, 'antenna')).toHaveLength(1)
  expect(partsIn(container, 'eyes')).toHaveLength(1)
  const box = rootOf(container).getBoundingClientRect()
  expect([box.width, box.height]).toEqual([44, 44])
})

it('lets a consumer class size the stage instead of the default', () => {
  styleRule(`.${SIZING_CLASS}{inline-size:88px;block-size:88px}`)
  const {container} = renderMascot(() => <Mascot class={SIZING_CLASS} />)
  const box = rootOf(container).getBoundingClientRect()
  expect([box.width, box.height]).toEqual([88, 88])
})

it('lets a consumer style size the stage instead of the default', () => {
  const {container} = renderMascot(() => <Mascot style={{width: '72px', height: '72px'}} />)
  const box = rootOf(container).getBoundingClientRect()
  expect([box.width, box.height]).toEqual([72, 72])
})

it('keeps the geometry of a layer when a consumer style tries to take it over', () => {
  const {container} = renderMascot(() => (
    <Mascot>
      <Mascot.Eyes style={{position: 'static', 'background-image': 'none', opacity: 0.5}} />
    </Mascot>
  ))
  const eyes = partOf(container, 'eyes')
  const applied = getComputedStyle(eyes)
  expect(applied.position).toBe('absolute')
  expect(applied.backgroundImage.startsWith('url(')).toBe(true)
  expect(applied.opacity).toBe('0.5')
})

it('keeps the rig alive when one of two children claiming a part unmounts', async () => {
  const [both, setBoth] = createSignal(true)
  const {container} = renderMascot(() => (
    <Mascot working>
      <Mascot.Eyes id="first-eyes" />
      <Show when={both()}>
        <Mascot.Eyes id="second-eyes" />
      </Show>
    </Mascot>
  ))
  setBoth(false)
  await wait(DRAIN_MS)
  expect(partsIn(container, 'eyes').map((eyes) => eyes.id)).toEqual(['first-eyes'])
  expect(leanWrappersIn(container)).toHaveLength(1)
  expect(emittersIn(container)).toHaveLength(1)
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

it('keeps a single emitter across a working flap that runs through the drain', async () => {
  const [working, setWorking] = createSignal(true)
  const {container} = renderMascot(() => <Mascot working={working()} />)
  expect(emittersIn(container)).toHaveLength(1)
  setWorking(false)
  await wait(DRAIN_MS)
  expect(emittersIn(container)).toHaveLength(0)
  setWorking(true)
  expect(emittersIn(container)).toHaveLength(1)
  await wait(DRAIN_MS)
  expect(emittersIn(container)).toHaveLength(1)
})

it('drains the flying digits instead of dropping them when the curve changes', async () => {
  const [curve, setCurve] = createSignal<'straight' | 'arc'>('straight')
  const {container} = renderMascot(() => <Mascot working curve={curve()} />)
  expect(emittersIn(container)).toHaveLength(1)
  setCurve('arc')
  expect(emittersIn(container)).toHaveLength(2)
  await wait(DRAIN_MS)
  const remaining = emittersIn(container)
  expect(remaining).toHaveLength(1)
  expect(ridersIn(remaining[0] ?? document.createElement('span'))).toHaveLength(5)
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

it('lets the antenna opt out of the gaze while the eyes keep tracking it', async () => {
  const {container} = renderMascot(() => (
    <Mascot>
      <Mascot.Antenna follow={false} />
      <div id="gaze-target" style={{'inline-size': '20px', 'block-size': '20px', 'margin-inline-start': '90px'}} />
    </Mascot>
  ))
  const target = container.querySelector('#gaze-target')
  if (target === null) throw new Error('the gaze target did not render')
  await page.elementLocator(target).hover()
  await wait(DRAIN_MS)
  const eyes = partOf(container, 'eyes')
  const lean = partOf(container, 'antenna').parentElement
  expect(Math.abs(Number(gsap.getProperty(eyes, 'x'))) > 0).toBe(true)
  expect(Number(gsap.getProperty(lean, 'rotation'))).toBe(0)
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
