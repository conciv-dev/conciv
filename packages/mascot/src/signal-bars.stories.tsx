import {createEffect, onCleanup, onMount, untrack, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {signalBarsEffect} from './core/effects/signal-bars.js'
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

function SignalBarsStage(props: StageProps): JSX.Element {
  const config = (): MascotConfig => ({state: props.state, working: props.working, follow: true})
  const service = createMascot(untrack(config))
  let stage: HTMLDivElement | undefined
  let head: HTMLDivElement | undefined
  let eyes: HTMLDivElement | undefined
  let antenna: HTMLDivElement | undefined

  onMount(() => {
    if (stage === undefined || head === undefined || eyes === undefined || antenna === undefined) return
    service.registerParts({stage, head, eyes, antenna})
    service.mountEffect('signal-bars', signalBarsEffect)
  })

  createEffect(() => service.update(config()))

  onCleanup(() => service.destroy())

  return (
    <div
      ref={(element) => (stage = element)}
      style={stageStyle}
      role="img"
      aria-label="conciv robot mascot with a signal bars effect anchored to its antenna"
    >
      <div ref={(element) => (head = element)} style={layerStyle(robotLayers.head)} />
      <div ref={(element) => (eyes = element)} style={layerStyle(robotLayers.eyes)} />
      <div ref={(element) => (antenna = element)} style={layerStyle(robotLayers.antenna)} />
    </div>
  )
}

const COMPONENT_DOCS = `
Signal bars: four bars anchored to the antenna tip step through a steadily rising bar chart, pulsing
opacity from 0.2 to 1 on a staggered \`steps(1)\` beat while \`working\` is true, and drain back into the
tip when work stops. Toggle **working** to start and stop the emitter.
`

const meta: Meta<StageProps> = {
  title: 'mascot/Effects/SignalBars',
  tags: ['autodocs'],
  parameters: {docs: {description: {component: COMPONENT_DOCS}}},
  args: {state: 'rest', working: true},
  argTypes: {
    state: {control: 'inline-radio', options: ['rest', 'awake'], description: 'Resting expression'},
    working: {control: 'boolean', description: 'Drives the activity overlay that mounts this effect'},
  },
}
export default meta
type Story = StoryObj<StageProps>

export const Playground: Story = {
  render: (args) => (
    <div style={frameStyle}>
      <SignalBarsStage state={args.state} working={args.working} />
    </div>
  ),
}
