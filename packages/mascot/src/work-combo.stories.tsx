import {createEffect, createSignal, onCleanup, For, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import gsap from 'gsap'
import {bubbleVariations} from './story-bubble-effects.js'
import {
  cellStyle,
  chromeBorderColor,
  driveAntenna,
  gridStyle,
  labelStyle,
  noteStyle,
  pageStyle,
  RigStage,
  rowStyle,
  stageWrapStyle,
  TipTransition,
  toggleStyle,
  workMotions,
  type MotionOption,
} from './story-support.js'

const meta: Meta = {title: 'mascot/WorkCombo'}
export default meta
type Story = StoryObj

function segmentStyle(selected: boolean): JSX.CSSProperties {
  return {
    'min-height': '44px',
    padding: '0.5rem 0.75rem',
    border: `1px solid ${chromeBorderColor}`,
    'border-radius': '0.375rem',
    background: selected ? 'rgba(224, 33, 138, 0.22)' : 'transparent',
    color: 'inherit',
    cursor: 'pointer',
  }
}

function ComboStage(props: {option: MotionOption; active: boolean; effect: () => JSX.Element}): JSX.Element {
  const [antenna, setAntenna] = createSignal<HTMLElement>()
  let stop: (() => void) | undefined

  createEffect(() => {
    const element = antenna()
    const motion = props.option.motion
    const staticPose = props.option.staticPose
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

  return (
    <div style={stageWrapStyle}>
      <RigStage state="closed" onAntennaReady={setAntenna} />
      <TipTransition active={props.active}>
        <Dynamic component={props.effect} />
      </TipTransition>
    </div>
  )
}

function Playground(): JSX.Element {
  const [working, setWorking] = createSignal(true)
  const [motionId, setMotionId] = createSignal('vibration')
  const fallbackMotion: MotionOption = {id: 'none', label: 'none', staticPose: {rotation: 0}}
  const option = (): MotionOption => workMotions.find((entry) => entry.id === motionId()) ?? fallbackMotion

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
      <div style={rowStyle}>
        <span style={labelStyle}>antenna motion</span>
        <For each={workMotions}>
          {(entry) => (
            <button
              type="button"
              aria-pressed={motionId() === entry.id}
              onClick={() => setMotionId(entry.id)}
              style={segmentStyle(motionId() === entry.id)}
            >
              {entry.label}
            </button>
          )}
        </For>
      </div>
      <span style={noteStyle}>
        the antenna motion applies to every cell at once, and the rig is pinned to its closed pose so the story timeline
        is the only thing driving the antenna transform. the rig's own closed-state pointer-follow still composes on
        top: the eyes translate and the antenna leans toward the cursor
      </span>
      <div style={gridStyle}>
        <For each={bubbleVariations}>
          {(variation) => (
            <div style={cellStyle}>
              <ComboStage option={option()} active={working()} effect={variation.effect} />
              <span style={labelStyle}>{variation.name}</span>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}

export const EffectAndMotion: Story = {
  render: () => <Playground />,
}
