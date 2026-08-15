import {createEffect, onCleanup, onMount, untrack, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {sparkFountainEffect} from './core/effects/spark-fountain.js'
import {createMascot, robotLayers, type MascotConfig, type MascotState} from './rig.js'

const STAGE_SIZE_PX = 120

const HEADROOM_PX = 192

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

function MascotStage(props: StageProps): JSX.Element {
  const config = (): MascotConfig => ({state: props.state, working: props.working, follow: false})
  const service = createMascot(untrack(config))
  let stage: HTMLDivElement | undefined
  let head: HTMLDivElement | undefined
  let eyes: HTMLDivElement | undefined
  let antenna: HTMLDivElement | undefined

  onMount(() => {
    if (stage === undefined || head === undefined || eyes === undefined || antenna === undefined) return
    service.registerParts({stage, head, eyes, antenna})
    service.mountEffect('spark-fountain', sparkFountainEffect)
  })

  createEffect(() => service.update(config()))

  onCleanup(() => service.destroy())

  return (
    <div style={frameStyle}>
      <div ref={(element) => (stage = element)} style={stageStyle} role="img" aria-label="conciv robot mascot">
        <div ref={(element) => (head = element)} style={layerStyle(robotLayers.head)} />
        <div ref={(element) => (eyes = element)} style={layerStyle(robotLayers.eyes)} />
        <div ref={(element) => (antenna = element)} style={layerStyle(robotLayers.antenna)} />
      </div>
    </div>
  )
}

const COMPONENT_DOCS = `
Mechanical port of the donor "Spark fountain" bubble effect (\`SparkFountain\` in the mascot-gaze branch's
story-bubble-effects) onto the current effect-mount contract. A canvas anchored to the antenna tip emits two
gravity-arced sparks every 60ms into a narrow upward cone, each living 1200ms and fading as it falls, scaled by
the antenna factor including the emission speed and gravity constant.

Toggle **working** to watch the fountain spray start and the canvas fade back into the tip when activity stops.
`

const meta: Meta<StageProps> = {
  title: 'mascot/Effects/SparkFountain',
  tags: ['autodocs'],
  parameters: {docs: {description: {component: COMPONENT_DOCS}}},
  args: {state: 'rest', working: true},
  argTypes: {
    state: {control: 'inline-radio', options: ['rest', 'awake'], description: 'Resting expression'},
    working: {control: 'boolean', description: 'Activity overlay: mounts and drives the spark fountain effect'},
  },
}
export default meta
type Story = StoryObj<StageProps>

export const Playground: Story = {
  render: (args) => <MascotStage state={args.state} working={args.working} />,
}
