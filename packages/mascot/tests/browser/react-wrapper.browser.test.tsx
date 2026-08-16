import {act, type ReactNode, StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {page} from 'vitest/browser'
import {expect, it, onTestFinished, vi} from 'vitest'
import gsap from 'gsap'
import {notesEffect} from '../../src/core/effects/notes.js'
import {Mascot} from '../../src/react/index.js'
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

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

type Mounted = {
  container: HTMLElement
  update: (view: ReactNode) => void
  unmount: () => void
  errors: string[]
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

function mountInto(host: Element | DocumentFragment, container: HTMLElement, view: ReactNode): Mounted {
  const errors: string[] = []
  const root = createRoot(host, {onUncaughtError: (error) => errors.push(messageOf(error))})
  const unmount = () => {
    if (!container.isConnected) return
    act(() => root.unmount())
    container.remove()
  }
  onTestFinished(unmount)
  act(() => root.render(view))
  return {container, update: (next) => act(() => root.render(next)), unmount, errors}
}

function renderMascot(view: ReactNode): Mounted {
  const container = document.createElement('div')
  document.body.append(container)
  return mountInto(container, container, view)
}

function renderInShadow(view: ReactNode): ShadowRoot {
  const container = document.createElement('div')
  document.body.append(container)
  const shadow = container.attachShadow({mode: 'open'})
  mountInto(shadow, container, view)
  return shadow
}

function countPointerMoveListeners(): () => number {
  const addListener = window.addEventListener
  const removeListener = window.removeEventListener
  let listeners = 0
  const countingAdd = (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) => {
    if (type === 'pointermove') listeners += 1
    addListener.call(window, type, listener, options)
  }
  const countingRemove = (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ) => {
    if (type === 'pointermove') listeners -= 1
    removeListener.call(window, type, listener, options)
  }
  window.addEventListener = countingAdd
  window.removeEventListener = countingRemove
  onTestFinished(() => {
    window.addEventListener = addListener
    window.removeEventListener = removeListener
  })
  return () => listeners
}

const SIZING_CLASS = 'tall-react-mascot'

const FADED_CLASS = 'faded-react-mascot'

const DATA_URL = "url('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')"

it('renders one head, one antenna and one eyes layer on a stage with a real size', () => {
  const {container} = renderMascot(<Mascot />)
  expect(partsIn(container, 'head')).toHaveLength(1)
  expect(partsIn(container, 'antenna')).toHaveLength(1)
  expect(partsIn(container, 'eyes')).toHaveLength(1)
  const box = rootOf(container).getBoundingClientRect()
  expect([box.width, box.height]).toEqual([44, 44])
})

it('lets a consumer class size the stage instead of the default', () => {
  styleRule(`.${SIZING_CLASS}{inline-size:88px;block-size:88px}`)
  const {container} = renderMascot(<Mascot className={SIZING_CLASS} />)
  const box = rootOf(container).getBoundingClientRect()
  expect([box.width, box.height]).toEqual([88, 88])
})

it('lets a consumer style size the stage instead of the default', () => {
  const {container} = renderMascot(<Mascot style={{width: '72px', height: '72px'}} />)
  const box = rootOf(container).getBoundingClientRect()
  expect([box.width, box.height]).toEqual([72, 72])
})

it('keeps the geometry of a layer when a consumer style tries to take it over', () => {
  const {container} = renderMascot(
    <Mascot>
      <Mascot.Eyes
        style={{
          position: 'static',
          backgroundImage: 'none',
          background: 'none',
          backgroundColor: 'rgb(10, 20, 30)',
          opacity: 0.5,
        }}
      />
    </Mascot>,
  )
  const applied = getComputedStyle(partOf(container, 'eyes'))
  expect(applied.position).toBe('absolute')
  expect(applied.backgroundImage.startsWith('url(')).toBe(true)
  expect(applied.backgroundColor).toBe('rgb(10, 20, 30)')
  expect(applied.opacity).toBe('0.5')
})

it('keeps the stage visible at its default size when a consumer class only paints', () => {
  styleRule(`.${FADED_CLASS}{opacity:0.7}`)
  const {container} = renderMascot(<Mascot className={FADED_CLASS} />)
  const box = rootOf(container).getBoundingClientRect()
  expect([box.width, box.height]).toEqual([44, 44])
})

it('keeps a data url intact when the consumer paints the stage', () => {
  const {container} = renderMascot(<Mascot style={{backgroundImage: DATA_URL, opacity: 0.4}} />)
  const applied = getComputedStyle(rootOf(container))
  expect(applied.backgroundImage.includes('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBe(true)
  expect(applied.opacity).toBe('0.4')
})

it('ignores an undefined style value instead of sizing the stage with it', () => {
  const {container} = renderMascot(<Mascot style={{width: undefined, opacity: 0.6}} />)
  const box = rootOf(container).getBoundingClientRect()
  expect([box.width, box.height]).toEqual([44, 44])
  expect(getComputedStyle(rootOf(container)).opacity).toBe('0.6')
})

it('refuses a second child claiming the same part', () => {
  expect(() =>
    renderMascot(
      <Mascot>
        <Mascot.Eyes id="first-eyes" />
        <Mascot.Eyes id="second-eyes" />
      </Mascot>,
    ),
  ).toThrowError(/mascot part 'eyes' is already provided; render exactly one <Mascot.Eyes>/)
})

it('swaps a keyed part child without ever double-claiming its slot', () => {
  const mounted = renderMascot(
    <Mascot>
      <Mascot.Eyes key="first" id="first-eyes" />
    </Mascot>,
  )
  expect(partsIn(mounted.container, 'eyes').map((eyes) => eyes.id)).toEqual(['first-eyes'])
  mounted.update(
    <Mascot>
      <Mascot.Eyes key="second" id="second-eyes" />
    </Mascot>,
  )
  expect(mounted.errors).toEqual([])
  expect(partsIn(mounted.container, 'eyes').map((eyes) => eyes.id)).toEqual(['second-eyes'])
  expect(leanWrappersIn(mounted.container)).toHaveLength(1)
})

it('swaps a part child between two components without ever double-claiming its slot', () => {
  const FirstEyes = () => <Mascot.Eyes id="first-eyes" />
  const SecondEyes = () => <Mascot.Eyes id="second-eyes" />
  const eyesFor = (which: string) => <Mascot>{which === 'first' ? <FirstEyes /> : <SecondEyes />}</Mascot>
  const mounted = renderMascot(eyesFor('first'))
  expect(partsIn(mounted.container, 'eyes').map((eyes) => eyes.id)).toEqual(['first-eyes'])
  mounted.update(eyesFor('second'))
  expect(mounted.errors).toEqual([])
  expect(partsIn(mounted.container, 'eyes').map((eyes) => eyes.id)).toEqual(['second-eyes'])
  expect(leanWrappersIn(mounted.container)).toHaveLength(1)
})

it('claims a slot from inside a fragment and a list, then restores the default', () => {
  const withEyes = (present: boolean) => (
    <Mascot>
      <>
        <Mascot.Head />
        {present ? [<Mascot.Eyes key="listed" id="listed-eyes" />] : []}
      </>
    </Mascot>
  )
  const mounted = renderMascot(withEyes(true))
  expect(partsIn(mounted.container, 'eyes').map((eyes) => eyes.id)).toEqual(['listed-eyes'])
  expect(partsIn(mounted.container, 'head')).toHaveLength(1)
  mounted.update(withEyes(false))
  const restored = partsIn(mounted.container, 'eyes')
  expect(restored).toHaveLength(1)
  expect(restored[0]?.id).toBe('')
  expect(leanWrappersIn(mounted.container)).toHaveLength(1)
})

it('replaces the default eyes layer with the eyes child', () => {
  const {container} = renderMascot(
    <Mascot>
      <Mascot.Eyes id="consumer-eyes" />
    </Mascot>,
  )
  const eyes = partsIn(container, 'eyes')
  expect(eyes).toHaveLength(1)
  expect(eyes[0]?.id === 'consumer-eyes').toBe(true)
})

it('restores the default eyes layer when the eyes child unmounts', () => {
  const mounted = renderMascot(
    <Mascot>
      <Mascot.Eyes id="consumer-eyes" />
    </Mascot>,
  )
  mounted.update(<Mascot />)
  const eyes = partsIn(mounted.container, 'eyes')
  expect(eyes).toHaveLength(1)
  expect(eyes[0]?.id === 'consumer-eyes').toBe(false)
})

it('keeps one eyes layer and one lean wrapper through repeated child churn', () => {
  const mounted = renderMascot(
    <Mascot>
      <Mascot.Eyes id="consumer-eyes" />
    </Mascot>,
  )
  for (let round = 0; round < 5; round += 1) {
    mounted.update(<Mascot />)
    mounted.update(
      <Mascot>
        <Mascot.Eyes id="consumer-eyes" />
      </Mascot>,
    )
  }
  expect(partsIn(mounted.container, 'eyes')).toHaveLength(1)
  expect(leanWrappersIn(mounted.container)).toHaveLength(1)
})

it('binds every part when the children are given in another order', () => {
  const {container} = renderMascot(
    <Mascot>
      <Mascot.Eyes />
      <Mascot.Antenna />
      <Mascot.Head />
    </Mascot>,
  )
  expect(partsIn(container, 'head')).toHaveLength(1)
  expect(partsIn(container, 'antenna')).toHaveLength(1)
  expect(partsIn(container, 'eyes')).toHaveLength(1)
  expect(leanWrappersIn(container)).toHaveLength(1)
})

it('mounts the default binary emitter while the mascot works', () => {
  const {container} = renderMascot(<Mascot working />)
  expect(emittersIn(container)).toHaveLength(1)
})

it('keeps a single emitter across a working flap that runs through the drain', async () => {
  const mounted = renderMascot(<Mascot working />)
  expect(emittersIn(mounted.container)).toHaveLength(1)
  mounted.update(<Mascot working={false} />)
  await vi.waitFor(() => expect(emittersIn(mounted.container)).toHaveLength(0), DRAIN_TIMEOUT)
  mounted.update(<Mascot working />)
  expect(emittersIn(mounted.container)).toHaveLength(1)
})

it('drains the flying digits instead of dropping them when the curve changes', async () => {
  const mounted = renderMascot(<Mascot working curve="straight" />)
  expect(emittersIn(mounted.container)).toHaveLength(1)
  mounted.update(<Mascot working curve="arc" />)
  expect(emittersIn(mounted.container)).toHaveLength(2)
  await vi.waitFor(() => expect(emittersIn(mounted.container)).toHaveLength(1), DRAIN_TIMEOUT)
  const remaining = emittersIn(mounted.container)[0]
  expect(remaining === undefined ? [] : ridersIn(remaining)).toHaveLength(5)
})

it('mounts one emitter per effect child instead of the default one', () => {
  const {container} = renderMascot(
    <Mascot working>
      <Mascot.Binary />
      <Mascot.Binary />
    </Mascot>,
  )
  expect(emittersIn(container)).toHaveLength(2)
})

it('stands the default binary down when an effect child mounts another effect', () => {
  const {container} = renderMascot(
    <Mascot working>
      <Mascot.Effect mount={() => notesEffect} />
    </Mascot>,
  )
  expect(partsIn(container, 'effect')).toHaveLength(1)
  expect(emittersIn(container)).toHaveLength(0)
})

it('flies the digits along curve riders when the effect child asks for a curve', () => {
  const curved = renderMascot(
    <Mascot working>
      <Mascot.Binary curve="arc" />
    </Mascot>,
  )
  const straight = renderMascot(
    <Mascot working>
      <Mascot.Binary curve="straight" />
    </Mascot>,
  )
  const curvedEmitter = emittersIn(curved.container)[0]
  const straightEmitter = emittersIn(straight.container)[0]
  expect(curvedEmitter === undefined ? [] : ridersIn(curvedEmitter)).toHaveLength(5)
  expect(straightEmitter === undefined ? [] : ridersIn(straightEmitter)).toHaveLength(0)
})

it('lets the antenna opt out of the gaze while the eyes keep tracking it', async () => {
  const {container} = renderMascot(
    <Mascot>
      <Mascot.Antenna follow={false} />
      <div id="gaze-target" style={{inlineSize: '20px', blockSize: '20px', marginInlineStart: '90px'}} />
    </Mascot>,
  )
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
    const mounted = renderMascot(<Mascot working />)
    expect(emittersIn(mounted.container)).toHaveLength(1)
    mounted.unmount()
    expect(emittersIn(mounted.container)).toHaveLength(0)
  }
  expect(liveTweenCount()).toBe(before)
})

it('sizes the stage inside a shadow root the same way', () => {
  const shadow = renderInShadow(<Mascot />)
  const box = rootOf(shadow).getBoundingClientRect()
  expect([box.width, box.height]).toEqual([44, 44])
})

it('mounts one rig, one gaze listener and one emitter under strict mode', () => {
  const pointerMoveListeners = countPointerMoveListeners()
  const {container} = renderMascot(
    <StrictMode>
      <Mascot working>
        <Mascot.Antenna />
      </Mascot>
    </StrictMode>,
  )
  expect(leanWrappersIn(container)).toHaveLength(1)
  expect(emittersIn(container)).toHaveLength(1)
  expect(partsIn(container, 'antenna')).toHaveLength(1)
  expect(pointerMoveListeners()).toBe(0)
})

it('tracks the pointer with a single gaze listener under strict mode', () => {
  const pointerMoveListeners = countPointerMoveListeners()
  renderMascot(
    <StrictMode>
      <Mascot />
    </StrictMode>,
  )
  expect(pointerMoveListeners()).toBe(1)
})
