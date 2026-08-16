import {createSignal, For, type JSX, Match, Show, Switch} from 'solid-js'
import {Portal} from 'solid-js/web'
import {render} from '@solidjs/testing-library'
import {page} from 'vitest/browser'
import {expect, it, vi} from 'vitest'
import gsap from 'gsap'
import {notesEffect} from '../../src/core/effects/notes.js'
import {Mascot} from '../../src/solid/index.js'
import {
  DRAIN_TIMEOUT,
  emittersIn,
  leanWrappersIn,
  liveTweenCount,
  partOf,
  partsIn,
  ridersIn,
  rootOf,
  styleRule,
} from './mascot-dom.js'

const renderMascot = (view: () => JSX.Element): {container: HTMLElement; unmount: () => void} => {
  const mounted = render(view)
  return {container: mounted.container, unmount: mounted.unmount}
}

const shadowStageOf = (host: HTMLElement): HTMLElement => {
  const shadowed = [...host.querySelectorAll('div')].flatMap((element) =>
    element.shadowRoot === null
      ? []
      : [...element.shadowRoot.querySelectorAll<HTMLElement>('[data-scope="mascot"][data-part="root"]')],
  )
  const root = shadowed[0]
  if (root === undefined) throw new Error('the mascot root did not render inside a shadow root')
  return root
}

const SIZING_CLASS = 'tall-mascot'

const FADED_CLASS = 'faded-mascot'

const DATA_URL_STYLE = "background-image:url('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=');opacity:0.4"

const IMPORTANT_STYLE = 'opacity:0.3 !important'

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
      <Mascot.Eyes
        style={{
          position: 'static',
          'background-image': 'none',
          background: 'none',
          'background-color': 'rgb(10, 20, 30)',
          opacity: 0.5,
        }}
      />
    </Mascot>
  ))
  const eyes = partOf(container, 'eyes')
  const applied = getComputedStyle(eyes)
  expect(applied.position).toBe('absolute')
  expect(applied.backgroundImage.startsWith('url(')).toBe(true)
  expect(applied.backgroundColor).toBe('rgb(10, 20, 30)')
  expect(applied.opacity).toBe('0.5')
})

it('keeps the stage visible at its default size when a consumer class only paints', () => {
  styleRule(`.${FADED_CLASS}{opacity:0.7}`)
  const {container} = renderMascot(() => <Mascot class={FADED_CLASS} />)
  const box = rootOf(container).getBoundingClientRect()
  expect([box.width, box.height]).toEqual([44, 44])
})

it('refuses a second child claiming the same part', () => {
  expect(() =>
    renderMascot(() => (
      <Mascot>
        <Mascot.Eyes id="first-eyes" />
        <Mascot.Eyes id="second-eyes" />
      </Mascot>
    )),
  ).toThrowError(/mascot part 'eyes' is already provided; render exactly one <Mascot.Eyes>/)
})

it('swaps a keyed part child without ever double-claiming its slot', () => {
  const [key, setKey] = createSignal('first')
  const {container} = renderMascot(() => (
    <Mascot>
      <For each={[key()]}>{(current) => <Mascot.Eyes id={`${current}-eyes`} />}</For>
    </Mascot>
  ))
  expect(partsIn(container, 'eyes').map((eyes) => eyes.id)).toEqual(['first-eyes'])
  setKey('second')
  expect(partsIn(container, 'eyes').map((eyes) => eyes.id)).toEqual(['second-eyes'])
  expect(leanWrappersIn(container)).toHaveLength(1)
})

it('swaps a part child through a keyed Switch without ever double-claiming its slot', () => {
  const [which, setWhich] = createSignal('first')
  const {container} = renderMascot(() => (
    <Mascot>
      <Switch>
        <Match when={which() === 'first'}>
          <Mascot.Eyes id="first-eyes" />
        </Match>
        <Match when={which() === 'second'}>
          <Mascot.Eyes id="second-eyes" />
        </Match>
      </Switch>
    </Mascot>
  ))
  setWhich('second')
  expect(partsIn(container, 'eyes').map((eyes) => eyes.id)).toEqual(['second-eyes'])
  expect(leanWrappersIn(container)).toHaveLength(1)
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
  await vi.waitFor(() => expect(emittersIn(container)).toHaveLength(0), DRAIN_TIMEOUT)
  setWorking(true)
  expect(emittersIn(container)).toHaveLength(1)
})

it('drains the flying digits instead of dropping them when the curve changes', async () => {
  const [curve, setCurve] = createSignal<'straight' | 'arc'>('straight')
  const {container} = renderMascot(() => <Mascot working curve={curve()} />)
  expect(emittersIn(container)).toHaveLength(1)
  setCurve('arc')
  expect(emittersIn(container)).toHaveLength(2)
  await vi.waitFor(() => expect(emittersIn(container)).toHaveLength(1), DRAIN_TIMEOUT)
  const remaining = emittersIn(container)
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

it('stands the default binary down when an effect child mounts another effect', () => {
  const {container} = renderMascot(() => (
    <Mascot working>
      <Mascot.Effect mount={() => notesEffect} />
    </Mascot>
  ))
  expect(partsIn(container, 'effect')).toHaveLength(1)
  expect(emittersIn(container)).toHaveLength(0)
})

it('flies the digits along curve riders when the effect child asks for a curve', () => {
  const curved = renderMascot(() => (
    <Mascot working>
      <Mascot.Binary curve="arc" />
    </Mascot>
  ))
  const straight = renderMascot(() => (
    <Mascot working>
      <Mascot.Binary curve="straight" />
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
  const eyes = partOf(container, 'eyes')
  const lean = partOf(container, 'antenna').parentElement
  await vi.waitFor(() => expect(Math.abs(Number(gsap.getProperty(eyes, 'x'))) > 0).toBe(true), DRAIN_TIMEOUT)
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

it('sizes the stage inside a shadow root the same way', () => {
  renderMascot(() => (
    <Portal useShadow>
      <Mascot />
    </Portal>
  ))
  const root = shadowStageOf(document.body)
  const box = root.getBoundingClientRect()
  expect([box.width, box.height]).toEqual([44, 44])
})

it('keeps a data url intact when the consumer styles the stage with a string', () => {
  const {container} = renderMascot(() => <Mascot style={DATA_URL_STYLE} />)
  const applied = getComputedStyle(rootOf(container))
  expect(applied.backgroundImage.includes('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBe(true)
  expect(applied.opacity).toBe('0.4')
})

it('keeps the priority of an important declaration in a consumer string', () => {
  styleRule(`.${FADED_CLASS}{opacity:0.9}`)
  const {container} = renderMascot(() => <Mascot class={FADED_CLASS} style={IMPORTANT_STYLE} />)
  expect(getComputedStyle(rootOf(container)).opacity).toBe('0.3')
})

it('ignores an undefined style value instead of sizing the stage with it', () => {
  const {container} = renderMascot(() => <Mascot style={{width: undefined, opacity: 0.6}} />)
  const box = rootOf(container).getBoundingClientRect()
  expect([box.width, box.height]).toEqual([44, 44])
  expect(getComputedStyle(rootOf(container)).opacity).toBe('0.6')
})
