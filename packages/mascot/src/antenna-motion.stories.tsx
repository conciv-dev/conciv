import {createEffect, createSignal, onCleanup, onMount, For, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import gsap from 'gsap'
import {createFabRobotRig, robotLayers, type FabRobotRig} from './rig.js'

const meta: Meta = {title: 'mascot/AntennaMotion'}
export default meta
type Story = StoryObj

const STAGE_SIZE_PX = 44

const CELL_HEADROOM_PX = 28

const ANTENNA_ORIGIN = '50% 32.8%'

const LEAN_FALLOFF_PX = 220

const LEAN_DEGREES = 14

const chromeBorderColor = 'rgba(128, 134, 156, 0.45)'

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const stageStyle: JSX.CSSProperties = {
  display: 'inline-block',
  position: 'relative',
  width: `${STAGE_SIZE_PX}px`,
  height: `${STAGE_SIZE_PX}px`,
}

function layerStyle(image: string): JSX.CSSProperties {
  return {
    position: 'absolute',
    inset: '0',
    'background-image': `url('${image}')`,
    'background-repeat': 'no-repeat',
    'background-position': 'center',
    'background-size': 'contain',
    'image-rendering': 'pixelated',
    'will-change': 'transform',
  }
}

type AntennaMotion = (element: HTMLElement) => () => void

const vibrationBurst: AntennaMotion = (element) => {
  const timeline = gsap.timeline({repeat: -1, repeatDelay: 1.2})
  timeline.to(element, {rotation: 7, duration: 0.035, ease: 'none', yoyo: true, repeat: 13})
  timeline.to(element, {rotation: 0, duration: 0.14, ease: 'power2.out'})
  return () => timeline.kill()
}

const squashThrob: AntennaMotion = (element) => {
  const timeline = gsap.timeline({repeat: -1})
  timeline.to(element, {scaleY: 1.3, scaleX: 0.88, duration: 0.3, ease: 'power2.out'})
  timeline.to(element, {scaleY: 1, scaleX: 1, duration: 0.55, ease: 'elastic.out(1, 0.5)'})
  timeline.to(element, {scaleY: 1, duration: 0.3})
  return () => timeline.kill()
}

const elasticWobble: AntennaMotion = (element) => {
  const timeline = gsap.timeline({repeat: -1, repeatDelay: 0.65})
  timeline.to(element, {rotation: 24, duration: 0.09, ease: 'power2.in'})
  timeline.to(element, {rotation: 0, duration: 1.5, ease: 'elastic.out(1, 0.28)'})
  return () => timeline.kill()
}

const metronomeTick: AntennaMotion = (element) => {
  const timeline = gsap.timeline()
  timeline.fromTo(element, {rotation: -10}, {rotation: 10, duration: 0.44, ease: 'steps(1)', yoyo: true, repeat: -1}, 0)
  return () => timeline.kill()
}

const cursorLean: AntennaMotion = (element) => {
  const rotateTo = gsap.quickTo(element, 'rotation', {duration: 0.5, ease: 'power3.out'})
  const onPointerMove = (event: PointerEvent) => {
    const bounds = element.getBoundingClientRect()
    if (bounds.width === 0 || bounds.height === 0) return
    const offsetX = event.clientX - (bounds.left + bounds.width / 2)
    const offsetY = event.clientY - (bounds.top + bounds.height / 2)
    const distance = Math.sqrt(offsetX * offsetX + offsetY * offsetY)
    const reach = Math.min(1, distance / LEAN_FALLOFF_PX) * LEAN_DEGREES
    rotateTo(Math.cos(Math.atan2(offsetY, offsetX)) * reach)
  }
  window.addEventListener('pointermove', onPointerMove)
  return () => {
    window.removeEventListener('pointermove', onPointerMove)
    gsap.killTweensOf(element)
  }
}

const throbAndBurst: AntennaMotion = (element) => {
  const timeline = gsap.timeline({repeat: -1})
  timeline.to(element, {scaleY: 1.24, duration: 0.26, ease: 'power2.out'})
  timeline.to(element, {scaleY: 1, duration: 0.34, ease: 'power2.inOut'})
  timeline.to(element, {rotation: 6, duration: 0.035, ease: 'none', yoyo: true, repeat: 9})
  timeline.to(element, {rotation: 0, duration: 0.12, ease: 'power2.out'})
  return () => timeline.kill()
}

type Variation = {name: string; note: string; motion: AntennaMotion; staticPose: gsap.TweenVars}

const variations: Variation[] = [
  {
    name: 'Vibration bursts',
    note: 'jitter every 1.5s',
    motion: vibrationBurst,
    staticPose: {rotation: 6},
  },
  {
    name: 'Squash-stretch throb',
    note: 'pushes a signal up',
    motion: squashThrob,
    staticPose: {scaleY: 1.3, scaleX: 0.88},
  },
  {
    name: 'Elastic wobble',
    note: 'flick then settle',
    motion: elasticWobble,
    staticPose: {rotation: 18},
  },
  {
    name: 'Metronome tick',
    note: 'stepped, on a beat',
    motion: metronomeTick,
    staticPose: {rotation: -10},
  },
  {
    name: 'Cursor lean',
    note: 'follows the pointer, also while closed',
    motion: cursorLean,
    staticPose: {rotation: 8},
  },
  {
    name: 'Throb + burst',
    note: 'alternating beats',
    motion: throbAndBurst,
    staticPose: {scaleY: 1.24},
  },
]

function MotionStage(props: {motion: AntennaMotion; staticPose: gsap.TweenVars; active: boolean}): JSX.Element {
  let headElement: HTMLSpanElement | undefined
  let eyesElement: HTMLSpanElement | undefined
  let antennaElement: HTMLSpanElement | undefined
  let rig: FabRobotRig | undefined
  let stop: (() => void) | undefined

  const clearMotion = (element: HTMLElement) => {
    stop?.()
    stop = undefined
    gsap.killTweensOf(element)
    gsap.set(element, {rotation: 0, scaleX: 1, scaleY: 1})
  }

  onMount(() => {
    const element = antennaElement
    if (!headElement || !eyesElement || !element) return
    rig = createFabRobotRig({head: headElement, eyes: eyesElement, antenna: element})
    rig.apply('closed')
    gsap.set(element, {transformOrigin: ANTENNA_ORIGIN})
    createEffect(() => {
      clearMotion(element)
      if (!props.active) return
      if (prefersReducedMotion()) {
        gsap.set(element, props.staticPose)
        return
      }
      stop = props.motion(element)
    })
  })
  onCleanup(() => {
    stop?.()
    if (antennaElement) gsap.killTweensOf(antennaElement)
    rig?.destroy()
  })

  return (
    <span style={stageStyle} aria-hidden="true">
      <span style={layerStyle(robotLayers.head)} ref={(element) => (headElement = element)} />
      <span style={layerStyle(robotLayers.antenna)} ref={(element) => (antennaElement = element)} />
      <span style={layerStyle(robotLayers.eyes)} ref={(element) => (eyesElement = element)} />
    </span>
  )
}

const pageStyle: JSX.CSSProperties = {
  display: 'flex',
  'flex-direction': 'column',
  gap: '1.5rem',
  padding: '1.5rem',
  color: 'inherit',
  'font-family': 'system-ui, sans-serif',
}

const toggleStyle: JSX.CSSProperties = {
  'min-height': '44px',
  padding: '0.5rem 0.875rem',
  border: `1px solid ${chromeBorderColor}`,
  'border-radius': '0.375rem',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
}

const gridStyle: JSX.CSSProperties = {
  display: 'grid',
  'grid-template-columns': 'repeat(3, minmax(0, 1fr))',
  gap: '1rem',
}

const cellStyle: JSX.CSSProperties = {
  display: 'flex',
  'flex-direction': 'column',
  'align-items': 'center',
  gap: '0.5rem',
  'padding-block-start': `${CELL_HEADROOM_PX}px`,
  'padding-block-end': '0.75rem',
  'padding-inline': '0.5rem',
  border: `1px solid ${chromeBorderColor}`,
  'border-radius': '0.5rem',
}

const labelStyle: JSX.CSSProperties = {'font-size': '0.8125rem', 'text-align': 'center'}

const noteStyle: JSX.CSSProperties = {'font-size': '0.6875rem', 'text-align': 'center', opacity: '0.7'}

function Playground(): JSX.Element {
  const [transmitting, setTransmitting] = createSignal(true)

  return (
    <div style={pageStyle}>
      <div style={{display: 'flex', 'align-items': 'center', gap: '0.75rem'}}>
        <button
          type="button"
          aria-pressed={transmitting()}
          onClick={() => setTransmitting((current) => !current)}
          style={toggleStyle}
        >
          {transmitting() ? 'transmitting' : 'idle'}
        </button>
        <span style={noteStyle}>
          the rig is pinned to its closed pose so each story timeline is the only thing driving the antenna
        </span>
      </div>
      <div style={gridStyle}>
        <For each={variations}>
          {(variation) => (
            <div style={cellStyle}>
              <Dynamic
                component={MotionStage}
                motion={variation.motion}
                staticPose={variation.staticPose}
                active={transmitting()}
              />
              <span style={labelStyle}>{variation.name}</span>
              <span style={noteStyle}>{variation.note}</span>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}

export const Transforms: Story = {
  render: () => <Playground />,
}
