import {createEffect, onCleanup, onMount, untrack, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {tickRingEffect} from './core/effects/tick-ring.js'
import {createMascot, robotLayers, type MascotConfig, type MascotState} from './core/index.js'

const STAGE_SIZE_PX = 120

const HEADROOM_PX = Math.round(STAGE_SIZE_PX * 1.6)

const LAYER_STYLE: JSX.CSSProperties = {
  position: 'absolute',
  inset: '0',
  'background-repeat': 'no-repeat',
  'background-position': 'center',
  'background-size': 'contain',
  'image-rendering': 'pixelated',
}

const layerStyle = (image: string): JSX.CSSProperties => ({...LAYER_STYLE, 'background-image': `url('${image}')`})

const stageStyle: JSX.CSSProperties = {
  position: 'relative',
  display: 'block',
  'inline-size': `${STAGE_SIZE_PX}px`,
  'block-size': `${STAGE_SIZE_PX}px`,
}

const frameStyle: JSX.CSSProperties = {
  display: 'flex',
  'flex-direction': 'column',
  'align-items': 'center',
  'padding-block-start': `${HEADROOM_PX}px`,
  'padding-block-end': '24px',
}

type StageProps = {state: MascotState; working: boolean}

function TickRingFrame(props: StageProps): JSX.Element {
  return (
    <div style={frameStyle}>
      <TickRingStage state={props.state} working={props.working} />
    </div>
  )
}

function TickRingStage(props: StageProps): JSX.Element {
  const config = (): MascotConfig => ({state: props.state, working: props.working, follow: true})
  const service = createMascot(untrack(config))
  let stage: HTMLDivElement | undefined
  let head: HTMLDivElement | undefined
  let eyes: HTMLDivElement | undefined
  let antenna: HTMLDivElement | undefined

  onMount(() => {
    if (stage === undefined || head === undefined || eyes === undefined || antenna === undefined) return
    service.registerParts({stage, head, eyes, antenna})
    service.mountEffect('tick-ring', tickRingEffect)
  })

  createEffect(() => service.update(config()))

  onCleanup(() => service.destroy())

  return (
    <div
      ref={(element) => (stage = element)}
      style={stageStyle}
      role="img"
      aria-label="conciv robot mascot with a progress tick ring effect"
    >
      <div ref={(element) => (head = element)} style={layerStyle(robotLayers.head)} />
      <div ref={(element) => (eyes = element)} style={layerStyle(robotLayers.eyes)} />
      <div ref={(element) => (antenna = element)} style={layerStyle(robotLayers.antenna)} />
    </div>
  )
}

const COMPONENT_DOCS = `
\`tickRingEffect\` mounts a ring of twelve accent ticks above the antenna tip; they light up one at a time
around the ring, clockwise, while work is in flight, then drain back into the tip when work stops. Toggle
**working** to see it mount and drain.
`

const meta: Meta<StageProps> = {
  title: 'mascot/Effects/TickRing',
  tags: ['autodocs'],
  parameters: {docs: {description: {component: COMPONENT_DOCS}}},
  args: {state: 'rest', working: true},
  argTypes: {
    state: {control: 'inline-radio', options: ['rest', 'awake'], description: 'Resting expression'},
    working: {control: 'boolean', description: 'Activity overlay: mounts the tick ring effect while true'},
  },
}
export default meta
type Story = StoryObj<StageProps>

export const Playground: Story = {
  render: (args) => <TickRingFrame state={args.state} working={args.working} />,
}
