import {createEffect, createSignal, onCleanup, onMount, For, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent} from 'storybook/test'
import {createFabRobotRig, robotLayers, type FabRobotRig, type RigState} from './rig.js'

const meta: Meta = {title: 'mascot/FabRobotRig'}
export default meta
type Story = StoryObj

const STAGE_SIZE_PX = 44

const STATES: RigState[] = ['closed', 'open', 'work']

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

function RigStage(props: {state: RigState}): JSX.Element {
  let headElement: HTMLSpanElement | undefined
  let eyesElement: HTMLSpanElement | undefined
  let antennaElement: HTMLSpanElement | undefined
  let rig: FabRobotRig | undefined

  onMount(() => {
    if (!headElement || !eyesElement || !antennaElement) return
    rig = createFabRobotRig({head: headElement, eyes: eyesElement, antenna: antennaElement})
    createEffect(() => {
      rig?.apply(props.state)
    })
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

const panelStyle: JSX.CSSProperties = {
  display: 'flex',
  'flex-direction': 'column',
  'align-items': 'flex-start',
  gap: '1rem',
  padding: '1rem',
}

const controlsStyle: JSX.CSSProperties = {display: 'flex', 'align-items': 'center', gap: '0.5rem'}

const buttonStyle: JSX.CSSProperties = {
  'min-height': '44px',
  padding: '0.5rem 0.75rem',
  border: '1px solid currentcolor',
  'border-radius': '0.375rem',
  background: 'transparent',
  cursor: 'pointer',
}

function StateSwitch(props: {initial: RigState}): JSX.Element {
  const [state, setState] = createSignal<RigState>(props.initial)
  return (
    <div style={panelStyle}>
      <div style={controlsStyle}>
        <For each={STATES}>
          {(candidate) => (
            <button
              type="button"
              aria-pressed={state() === candidate}
              onClick={() => setState(() => candidate)}
              style={buttonStyle}
            >
              {candidate}
            </button>
          )}
        </For>
      </div>
      <RigStage state={state()} />
    </div>
  )
}

export const Closed: Story = {
  render: () => <RigStage state="closed" />,
}

export const Open: Story = {
  render: () => <RigStage state="open" />,
}

export const Working: Story = {
  render: () => <RigStage state="work" />,
}

export const StateControl: Story = {
  render: () => <StateSwitch initial="closed" />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', {name: 'closed'})).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(canvas.getByRole('button', {name: 'open'}))
    await expect(canvas.getByRole('button', {name: 'open'})).toHaveAttribute('aria-pressed', 'true')
    await expect(canvas.getByRole('button', {name: 'closed'})).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(canvas.getByRole('button', {name: 'work'}))
    await expect(canvas.getByRole('button', {name: 'work'})).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(canvas.getByRole('button', {name: 'closed'}))
    await expect(canvas.getByRole('button', {name: 'closed'})).toHaveAttribute('aria-pressed', 'true')
  },
}
