import {createEffect, onCleanup, onMount, untrack, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {sparkEffect} from './core/effects/spark.js'
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
    service.mountEffect('spark', sparkEffect)
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
Mechanical port of the donor "Electric spark" bubble effect (\`ElectricSpark\` in the mascot-gaze branch's
story-bubble-effects) onto the current effect-mount contract. Five yellow spark chips flicker in a
\`steps(1)\` stagger above the antenna tip while a soft glow pulses underneath, both driven by the same GSAP
timeline the donor used, anchored to the tip and scaled by the antenna factor.

Toggle **working** to see the effect mount and drain: it starts when activity begins and fades back into the
tip when activity stops, matching \`binaryEffect\`'s tip-transition contract.
`

const meta: Meta<StageProps> = {
  title: 'mascot/Effects/Spark',
  tags: ['autodocs'],
  parameters: {docs: {description: {component: COMPONENT_DOCS}}},
  args: {state: 'rest', working: true},
  argTypes: {
    state: {control: 'inline-radio', options: ['rest', 'awake'], description: 'Resting expression'},
    working: {control: 'boolean', description: 'Activity overlay: mounts and drives the spark effect'},
  },
}
export default meta
type Story = StoryObj<StageProps>

export const Playground: Story = {
  render: (args) => <MascotStage state={args.state} working={args.working} />,
}
