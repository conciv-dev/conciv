import {createEffect, createMemo, createSignal, onCleanup, onMount, For, Show, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import gsap from 'gsap'
import {MotionPathPlugin} from 'gsap/MotionPathPlugin'
import {
  cellStyle,
  chromeBorderColor,
  driveAntenna,
  gridStyle,
  labelStyle,
  noteStyle,
  pageStyle,
  prefersReducedMotion,
  RigStage,
  rowStyle,
  squashThrob,
  stageWrapStyle,
  TipTransition,
  TIP_STAGE_X,
  TIP_STAGE_Y,
  toggleStyle,
  type EmitterPoint,
  type EmitterRoom,
} from './story-support.js'
import {measureEmitterRoom} from './story-support.js'

gsap.registerPlugin(MotionPathPlugin)

const meta: Meta = {title: 'mascot/EmitterPath'}
export default meta
type Story = StoryObj

const BOX_WIDTH_PX = 200

const BOX_HEIGHT_PX = 150

const BOX_INSET_PX = 20

const DIGIT_INDEXES = [0, 1, 2, 3, 4]

const DIGIT_STAGGER_SECONDS = 0.42

const DIGIT_TRAVEL_SECONDS = 2.2

const TANGENT_ROTATION_OFFSET = 90

const LANE_OFFSET_PX = 3

const PATH_SAMPLE_COUNT = 60

const PATH_SAMPLES = Array.from({length: PATH_SAMPLE_COUNT + 1}, (_, index) => index / PATH_SAMPLE_COUNT)

const accentColor = '#e0218a'

type CurveStyle = {
  id: string
  label: string
  note: string
  curviness: number
  path: (room: EmitterRoom, index: number) => EmitterPoint[]
}

const gentleArc: CurveStyle = {
  id: 'arc',
  label: 'gentle arc',
  note: 'leaves the tip straight up, then eases into the open side',
  curviness: 1.5,
  path: (room) => [
    {x: 0, y: 0},
    {x: 0, y: -room.rise * 0.45},
    {x: room.bend * 0.45, y: -room.rise * 0.9},
    {x: room.bend, y: -room.rise},
  ],
}

const cornerHook: CurveStyle = {
  id: 'hook',
  label: 'hook',
  note: 'climbs the antenna axis, then turns a full corner and runs sideways',
  curviness: 1,
  path: (room) => [
    {x: 0, y: 0},
    {x: 0, y: -room.rise * 0.72},
    {x: room.bend * 0.34, y: -room.rise},
    {x: room.bend, y: -room.rise * 0.88},
  ],
}

const spreadFan: CurveStyle = {
  id: 'fan',
  label: 'fan',
  note: 'same vertical launch, each digit peels into its own lane',
  curviness: 1.4,
  path: (room, index) => {
    const lane = 0.55 + index * 0.22
    const lift = 0.86 + (index % 2) * 0.14
    return [
      {x: 0, y: 0},
      {x: 0, y: -room.rise * 0.45 * lift},
      {x: room.bend * 0.4 * lane, y: -room.rise * 0.85 * lift},
      {x: room.bend * lane, y: -room.rise * lift},
    ]
  },
}

const curveStyles: CurveStyle[] = [gentleArc, cornerHook, spreadFan]

type Placement = {id: string; label: string; position: JSX.CSSProperties}

const placements: Placement[] = [
  {id: 'top-left', label: 'top-left', position: {left: `${BOX_INSET_PX}px`, top: `${BOX_INSET_PX}px`}},
  {id: 'top-center', label: 'top-center', position: {left: 'calc(50% - 22px)', top: `${BOX_INSET_PX}px`}},
  {id: 'top-right', label: 'top-right', position: {right: `${BOX_INSET_PX}px`, top: `${BOX_INSET_PX}px`}},
  {id: 'middle-left', label: 'middle-left', position: {left: `${BOX_INSET_PX}px`, top: 'calc(50% - 22px)'}},
  {id: 'center', label: 'center', position: {left: 'calc(50% - 22px)', top: 'calc(50% - 22px)'}},
  {
    id: 'bottom-right',
    label: 'bottom-right',
    position: {right: `${BOX_INSET_PX}px`, bottom: `${BOX_INSET_PX}px`},
  },
]

const boxStyle: JSX.CSSProperties = {
  position: 'relative',
  width: `${BOX_WIDTH_PX}px`,
  height: `${BOX_HEIGHT_PX}px`,
  overflow: 'hidden',
  border: `1px dashed ${chromeBorderColor}`,
  'border-radius': '0.5rem',
}

const riderStyle: JSX.CSSProperties = {
  position: 'absolute',
  left: '0',
  top: '0',
  width: '0',
  height: '0',
  'will-change': 'transform, opacity',
}

const glyphStyleBase: JSX.CSSProperties = {
  position: 'absolute',
  left: '0',
  top: '0',
  'font-family': 'ui-monospace, monospace',
  'font-size': '9px',
  'font-weight': '700',
  'line-height': '1',
  color: accentColor,
}

function laneOffsetPixels(index: number): number {
  return index % 2 === 0 ? LANE_OFFSET_PX : -LANE_OFFSET_PX
}

function glyphStyle(index: number): JSX.CSSProperties {
  return {...glyphStyleBase, transform: `translate(-50%, -50%) translateX(${laneOffsetPixels(index)}px)`}
}

const placementCellStyle: JSX.CSSProperties = {...cellStyle, 'padding-block-start': '0.75rem'}

const placementGridStyle: JSX.CSSProperties = {
  ...gridStyle,
  'grid-template-columns': `repeat(auto-fit, minmax(${BOX_WIDTH_PX}px, max-content))`,
  'justify-content': 'start',
}

function stagePlacementStyle(placement: Placement): JSX.CSSProperties {
  return {...stageWrapStyle, ...placement.position, position: 'absolute'}
}

const sectionStyle: JSX.CSSProperties = {
  display: 'flex',
  'flex-direction': 'column',
  gap: '0.75rem',
  'padding-block-end': '0.5rem',
}

const sectionHeadingStyle: JSX.CSSProperties = {
  margin: '0',
  'font-size': '0.9375rem',
  'font-weight': '600',
}

function digitPath(style: CurveStyle, room: EmitterRoom, index: number): EmitterPoint[] {
  if (room.bend === 0) {
    return [
      {x: 0, y: 0},
      {x: 0, y: -room.rise * 0.5},
      {x: 0, y: -room.rise},
    ]
  }
  return style.path(room, index)
}

function evenSpeedPoints(style: CurveStyle, room: EmitterRoom, index: number): EmitterPoint[] {
  const rawPath = MotionPathPlugin.cacheRawPathMeasurements(
    MotionPathPlugin.arrayToRawPath(digitPath(style, room, index), {curviness: style.curviness}),
  )
  return PATH_SAMPLES.map((sample) => {
    const point = MotionPathPlugin.getPositionOnPath(rawPath, sample)
    return {x: point.x, y: point.y}
  })
}

type EmitterPlan = {room: EmitterRoom; style: CurveStyle}

function PathEmitter(props: {plan: EmitterPlan}): JSX.Element {
  const digitElements: HTMLSpanElement[] = []
  let timeline: gsap.core.Timeline | undefined

  onMount(() => {
    const {room, style} = props.plan
    if (prefersReducedMotion()) {
      for (const [index, digit] of digitElements.entries()) {
        const points = digitPath(style, room, index)
        const last = points[points.length - 1]
        const fraction = (index + 1) / (DIGIT_INDEXES.length + 1)
        gsap.set(digit, {x: (last?.x ?? 0) * fraction, y: (last?.y ?? 0) * fraction, opacity: 1 - index * 0.16})
      }
      return
    }
    gsap.set(digitElements, {opacity: 0})
    timeline = gsap.timeline()
    for (const [index, digit] of digitElements.entries()) {
      const start = index * DIGIT_STAGGER_SECONDS
      timeline.to(
        digit,
        {
          motionPath: {
            path: evenSpeedPoints(style, room, index),
            curviness: 0,
            autoRotate: TANGENT_ROTATION_OFFSET,
          },
          duration: DIGIT_TRAVEL_SECONDS,
          ease: 'none',
          repeat: -1,
        },
        start,
      )
      timeline.to(
        digit,
        {
          keyframes: {opacity: [0, 1, 1, 0], easeEach: 'none'},
          duration: DIGIT_TRAVEL_SECONDS,
          ease: 'none',
          repeat: -1,
        },
        start,
      )
    }
  })
  onCleanup(() => {
    timeline?.kill()
    gsap.killTweensOf(digitElements)
  })

  return (
    <For each={DIGIT_INDEXES}>
      {(index) => (
        <span ref={(element) => digitElements.push(element)} style={riderStyle}>
          <span style={glyphStyle(index)}>{index % 2 === 0 ? '1' : '0'}</span>
        </span>
      )}
    </For>
  )
}

function PlacementCell(props: {placement: Placement; style: CurveStyle; active: boolean}): JSX.Element {
  const [room, setRoom] = createSignal<EmitterRoom>()
  const [antenna, setAntenna] = createSignal<HTMLElement>()
  let boxElement: HTMLDivElement | undefined
  let stageElement: HTMLDivElement | undefined
  let stopAntenna: (() => void) | undefined

  onMount(() => {
    if (boxElement === undefined || stageElement === undefined) return
    const bounds = boxElement.getBoundingClientRect()
    const stage = stageElement.getBoundingClientRect()
    setRoom(measureEmitterRoom({x: stage.left + TIP_STAGE_X, y: stage.top + TIP_STAGE_Y}, bounds))
  })

  createEffect(() => {
    const element = antenna()
    const active = props.active
    if (element === undefined) return
    stopAntenna?.()
    stopAntenna = driveAntenna(element, squashThrob, {scaleY: 1.3, scaleX: 0.88}, active)
  })
  onCleanup(() => {
    stopAntenna?.()
    const element = antenna()
    if (element !== undefined) gsap.killTweensOf(element)
  })

  const plan = createMemo<EmitterPlan | undefined>(() => {
    const measured = room()
    if (measured === undefined) return undefined
    return {room: measured, style: props.style}
  })

  return (
    <div style={placementCellStyle}>
      <div style={boxStyle} ref={(element) => (boxElement = element)}>
        <div style={stagePlacementStyle(props.placement)} ref={(element) => (stageElement = element)}>
          <RigStage state="closed" onAntennaReady={setAntenna} />
          <TipTransition active={props.active}>
            <Show when={plan()} keyed>
              {(value) => <PathEmitter plan={value} />}
            </Show>
          </TipTransition>
        </div>
      </div>
      <span style={labelStyle}>{props.placement.label}</span>
      <Show when={room()}>
        {(measured) => (
          <span style={noteStyle}>
            rise {Math.round(measured().rise)}px · bend {Math.round(measured().bend)}px
          </span>
        )}
      </Show>
    </div>
  )
}

function StyleSection(props: {style: CurveStyle; active: boolean}): JSX.Element {
  return (
    <section style={sectionStyle}>
      <div style={rowStyle}>
        <h2 style={sectionHeadingStyle}>{props.style.label}</h2>
        <span style={noteStyle}>{props.style.note}</span>
      </div>
      <div style={placementGridStyle}>
        <For each={placements}>
          {(placement) => <PlacementCell placement={placement} style={props.style} active={props.active} />}
        </For>
      </div>
    </section>
  )
}

function Playground(): JSX.Element {
  const [working, setWorking] = createSignal(true)

  return (
    <div style={pageStyle}>
      <div style={rowStyle}>
        <button
          type="button"
          aria-pressed={working()}
          onClick={() => setWorking((current) => !current)}
          style={toggleStyle}
        >
          {working() ? 'working' : 'idle'}
        </button>
      </div>
      <span style={noteStyle}>
        every dashed box stands in for the viewport and clips what leaves it. the robot sits where the FAB would sit,
        and the digit path is derived from the measured gap between the antenna tip and the box edges, never from the
        placement name: full headroom rises straight up, a squeezed top bends toward whichever side has more room. every
        path leaves the tip along the antenna axis, and each digit rides the curve and tilts with its tangent
      </span>
      <For each={curveStyles}>{(entry) => <StyleSection style={entry} active={working()} />}</For>
    </div>
  )
}

export const Placements: Story = {
  render: () => <Playground />,
}
