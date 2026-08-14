import {createEffect, createSignal, onCleanup, onMount, Show, type JSX} from 'solid-js'
import gsap from 'gsap'
import {createFabRobotRig, robotLayers, type FabRobotRig, type RigState} from './rig.js'

export const STAGE_SIZE_PX = 44

export const CELL_HEADROOM_PX = 96

export const ANTENNA_PIXEL_SIZE = 128

export const TIP_PIXEL_X = 64

export const TIP_PIXEL_Y = 20

export const TIP_STAGE_X = (TIP_PIXEL_X * STAGE_SIZE_PX) / ANTENNA_PIXEL_SIZE

export const TIP_STAGE_Y = (TIP_PIXEL_Y * STAGE_SIZE_PX) / ANTENNA_PIXEL_SIZE

export const ANTENNA_ORIGIN = '50% 32.8%'

export const chromeBorderColor = 'rgba(128, 134, 156, 0.45)'

export const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const noop = () => undefined

export const stageStyle: JSX.CSSProperties = {
  display: 'inline-block',
  position: 'relative',
  width: `${STAGE_SIZE_PX}px`,
  height: `${STAGE_SIZE_PX}px`,
}

export function layerStyle(image: string): JSX.CSSProperties {
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

export const tipAnchorStyle: JSX.CSSProperties = {
  position: 'absolute',
  left: `${TIP_STAGE_X}px`,
  top: `${TIP_STAGE_Y}px`,
  width: '0',
  height: '0',
  'pointer-events': 'none',
}

export const anchorStyle: JSX.CSSProperties = {
  position: 'absolute',
  left: '0',
  top: '0',
  width: '0',
  height: '0',
  'pointer-events': 'none',
}

export function RigStage(props: {state: RigState; onAntennaReady?: (element: HTMLElement) => void}): JSX.Element {
  let headElement: HTMLSpanElement | undefined
  let eyesElement: HTMLSpanElement | undefined
  let antennaElement: HTMLSpanElement | undefined
  let rig: FabRobotRig | undefined

  onMount(() => {
    const antenna = antennaElement
    if (!headElement || !eyesElement || !antenna) return
    rig = createFabRobotRig({head: headElement, eyes: eyesElement, antenna})
    createEffect(() => {
      rig?.apply(props.state)
    })
    props.onAntennaReady?.(antenna)
  })
  onCleanup(() => rig?.destroy())

  return (
    <span style={stageStyle} aria-hidden="true">
      <span style={layerStyle(robotLayers.head)} ref={(element) => (headElement = element)} />
      <span style={layerStyle(robotLayers.antenna)} ref={(element) => (antennaElement = element)} />
      <span style={layerStyle(robotLayers.eyes)} ref={(element) => (eyesElement = element)} />
    </span>
  )
}

export function TipTransition(props: {active: boolean; children: JSX.Element}): JSX.Element {
  const [rendered, setRendered] = createSignal(false)
  let containerElement: HTMLDivElement | undefined
  let tween: gsap.core.Tween | undefined

  createEffect(() => {
    if (props.active) setRendered(true)
  })

  createEffect(() => {
    const active = props.active
    const element = containerElement
    if (!rendered() || element === undefined) return
    tween?.kill()
    if (prefersReducedMotion()) {
      gsap.set(element, {scale: 1, opacity: active ? 1 : 0})
      if (!active) setRendered(false)
      return
    }
    if (active) {
      tween = gsap.fromTo(
        element,
        {scale: 0.2, opacity: 0},
        {scale: 1, opacity: 1, duration: 0.36, ease: 'back.out(2.2)'},
      )
      return
    }
    tween = gsap.to(element, {
      scale: 0.2,
      opacity: 0,
      duration: 0.24,
      ease: 'power2.in',
      onComplete: () => setRendered(false),
    })
  })
  onCleanup(() => tween?.kill())

  return (
    <Show when={rendered()}>
      <div ref={(element) => (containerElement = element)} style={tipAnchorStyle}>
        {props.children}
      </div>
    </Show>
  )
}

const EDGE_MARGIN_PX = 12

const DESIRED_RISE_PX = 54

const MINIMUM_RISE_PX = 8

const BEND_OVERSHOOT = 0.4

const BEND_THRESHOLD_PX = 10

export type EmitterAnchor = {x: number; y: number}

export type EmitterBounds = {top: number; left: number; right: number}

export type EmitterRoom = {rise: number; bend: number}

export type EmitterPoint = {x: number; y: number}

export function measureEmitterRoom(anchor: EmitterAnchor, bounds: EmitterBounds): EmitterRoom {
  const headroom = anchor.y - bounds.top - EDGE_MARGIN_PX
  const rise = Math.max(MINIMUM_RISE_PX, Math.min(DESIRED_RISE_PX, headroom))
  const shortfall = DESIRED_RISE_PX - rise
  if (shortfall <= BEND_THRESHOLD_PX) return {rise, bend: 0}
  const roomLeft = anchor.x - bounds.left - EDGE_MARGIN_PX
  const roomRight = bounds.right - anchor.x - EDGE_MARGIN_PX
  const towardRight = roomRight >= roomLeft
  const available = Math.max(0, towardRight ? roomRight : roomLeft)
  const reach = Math.min(shortfall * (1 + BEND_OVERSHOOT), available)
  return {rise, bend: towardRight ? reach : -reach}
}

export type AntennaMotion = (element: HTMLElement) => () => void

export const vibrationBurst: AntennaMotion = (element) => {
  const timeline = gsap.timeline({repeat: -1, repeatDelay: 1.2})
  timeline.to(element, {rotation: 7, duration: 0.035, ease: 'none', yoyo: true, repeat: 13})
  timeline.to(element, {rotation: 0, duration: 0.14, ease: 'power2.out'})
  return () => timeline.kill()
}

export const squashThrob: AntennaMotion = (element) => {
  const timeline = gsap.timeline({repeat: -1})
  timeline.to(element, {scaleY: 1.3, scaleX: 0.88, duration: 0.3, ease: 'power2.out'})
  timeline.to(element, {scaleY: 1, scaleX: 1, duration: 0.55, ease: 'elastic.out(1, 0.5)'})
  timeline.to(element, {scaleY: 1, duration: 0.3})
  return () => timeline.kill()
}

export const elasticWobble: AntennaMotion = (element) => {
  const timeline = gsap.timeline({repeat: -1, repeatDelay: 0.65})
  timeline.to(element, {rotation: 24, duration: 0.09, ease: 'power2.in'})
  timeline.to(element, {rotation: 0, duration: 1.5, ease: 'elastic.out(1, 0.28)'})
  return () => timeline.kill()
}

export const metronomeTick: AntennaMotion = (element) => {
  const timeline = gsap.timeline()
  timeline.fromTo(element, {rotation: -10}, {rotation: 10, duration: 0.44, ease: 'steps(1)', yoyo: true, repeat: -1}, 0)
  return () => timeline.kill()
}

export const throbAndBurst: AntennaMotion = (element) => {
  const timeline = gsap.timeline({repeat: -1})
  timeline.to(element, {scaleY: 1.24, duration: 0.26, ease: 'power2.out'})
  timeline.to(element, {scaleY: 1, duration: 0.34, ease: 'power2.inOut'})
  timeline.to(element, {rotation: 6, duration: 0.035, ease: 'none', yoyo: true, repeat: 9})
  timeline.to(element, {rotation: 0, duration: 0.12, ease: 'power2.out'})
  return () => timeline.kill()
}

export type MotionOption = {id: string; label: string; motion?: AntennaMotion; staticPose: gsap.TweenVars}

export const workMotions: MotionOption[] = [
  {id: 'none', label: 'none', staticPose: {rotation: 0}},
  {id: 'vibration', label: 'vibration', motion: vibrationBurst, staticPose: {rotation: 6}},
  {id: 'throb', label: 'throb', motion: squashThrob, staticPose: {scaleY: 1.3, scaleX: 0.88}},
  {id: 'wobble', label: 'wobble', motion: elasticWobble, staticPose: {rotation: 18}},
  {id: 'metronome', label: 'metronome', motion: metronomeTick, staticPose: {rotation: -10}},
  {id: 'throb+burst', label: 'throb+burst', motion: throbAndBurst, staticPose: {scaleY: 1.24}},
]

export function driveAntenna(
  element: HTMLElement,
  motion: AntennaMotion | undefined,
  staticPose: gsap.TweenVars,
  active: boolean,
): () => void {
  gsap.killTweensOf(element)
  gsap.set(element, {rotation: 0, scaleX: 1, scaleY: 1, transformOrigin: ANTENNA_ORIGIN})
  if (!active || motion === undefined) return noop
  if (prefersReducedMotion()) {
    gsap.set(element, staticPose)
    return noop
  }
  return motion(element)
}

export const pageStyle: JSX.CSSProperties = {
  display: 'flex',
  'flex-direction': 'column',
  gap: '1.5rem',
  padding: '1.5rem',
  color: 'inherit',
  'font-family': 'system-ui, sans-serif',
}

export const toggleStyle: JSX.CSSProperties = {
  'min-height': '44px',
  padding: '0.5rem 0.875rem',
  border: `1px solid ${chromeBorderColor}`,
  'border-radius': '0.375rem',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
}

export const gridStyle: JSX.CSSProperties = {
  display: 'grid',
  'grid-template-columns': 'repeat(3, minmax(0, 1fr))',
  gap: '1rem',
}

export const cellStyle: JSX.CSSProperties = {
  display: 'flex',
  'flex-direction': 'column',
  'align-items': 'center',
  gap: '0.75rem',
  'padding-block-start': `${CELL_HEADROOM_PX}px`,
  'padding-block-end': '0.75rem',
  'padding-inline': '0.5rem',
  border: `1px solid ${chromeBorderColor}`,
  'border-radius': '0.5rem',
}

export const stageWrapStyle: JSX.CSSProperties = {
  position: 'relative',
  width: `${STAGE_SIZE_PX}px`,
  height: `${STAGE_SIZE_PX}px`,
}

export const labelStyle: JSX.CSSProperties = {'font-size': '0.8125rem', 'text-align': 'center'}

export const noteStyle: JSX.CSSProperties = {'font-size': '0.6875rem', 'text-align': 'center', opacity: '0.7'}

export const rowStyle: JSX.CSSProperties = {
  display: 'flex',
  'align-items': 'center',
  gap: '0.75rem',
  'flex-wrap': 'wrap',
}
