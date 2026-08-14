import {createEffect, createSignal, onCleanup, For, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import gsap from 'gsap'
import {
  cellStyle,
  cursorLean,
  driveAntenna,
  elasticWobble,
  gridStyle,
  labelStyle,
  metronomeTick,
  noteStyle,
  pageStyle,
  RigStage,
  rowStyle,
  squashThrob,
  throbAndBurst,
  toggleStyle,
  vibrationBurst,
  type AntennaMotion,
} from './story-support.js'

const meta: Meta = {title: 'mascot/AntennaMotion'}
export default meta
type Story = StoryObj

type Variation = {name: string; note: string; motion: AntennaMotion; staticPose: gsap.TweenVars}

const variations: Variation[] = [
  {name: 'Vibration bursts', note: 'jitter every 1.5s', motion: vibrationBurst, staticPose: {rotation: 6}},
  {
    name: 'Squash-stretch throb',
    note: 'pushes a signal up',
    motion: squashThrob,
    staticPose: {scaleY: 1.3, scaleX: 0.88},
  },
  {name: 'Elastic wobble', note: 'flick then settle', motion: elasticWobble, staticPose: {rotation: 18}},
  {name: 'Metronome tick', note: 'stepped, on a beat', motion: metronomeTick, staticPose: {rotation: -10}},
  {name: 'Cursor lean', note: 'follows the pointer, also while closed', motion: cursorLean, staticPose: {rotation: 8}},
  {name: 'Throb + burst', note: 'alternating beats', motion: throbAndBurst, staticPose: {scaleY: 1.24}},
]

const motionCellStyle: JSX.CSSProperties = {...cellStyle, 'padding-block-start': '28px', gap: '0.5rem'}

function MotionStage(props: {motion: AntennaMotion; staticPose: gsap.TweenVars; active: boolean}): JSX.Element {
  const [antenna, setAntenna] = createSignal<HTMLElement>()
  let stop: (() => void) | undefined

  createEffect(() => {
    const element = antenna()
    const motion = props.motion
    const staticPose = props.staticPose
    const active = props.active
    if (element === undefined) return
    stop?.()
    stop = driveAntenna(element, motion, staticPose, active)
  })
  onCleanup(() => {
    stop?.()
    const element = antenna()
    if (element !== undefined) gsap.killTweensOf(element)
  })

  return <RigStage state="closed" onAntennaReady={setAntenna} />
}

function Playground(): JSX.Element {
  const [transmitting, setTransmitting] = createSignal(true)

  return (
    <div style={pageStyle}>
      <div style={rowStyle}>
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
            <div style={motionCellStyle}>
              <MotionStage motion={variation.motion} staticPose={variation.staticPose} active={transmitting()} />
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
