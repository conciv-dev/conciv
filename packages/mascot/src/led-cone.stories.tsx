import {createEffect, onCleanup, onMount, untrack, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {ledConeEffect} from './core/effects/led-cone.js'
import {createMascot, robotLayers, type MascotConfig, type MascotState} from './rig.js'

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

function LedConeFrame(props: StageProps): JSX.Element {
  return (
    <div style={frameStyle}>
      <LedConeStage state={props.state} working={props.working} />
    </div>
  )
}

function LedConeStage(props: StageProps): JSX.Element {
  const config = (): MascotConfig => ({state: props.state, working: props.working, follow: true})
  const service = createMascot(untrack(config))
  let stage: HTMLDivElement | undefined
  let head: HTMLDivElement | undefined
  let eyes: HTMLDivElement | undefined
  let antenna: HTMLDivElement | undefined

  onMount(() => {
    if (stage === undefined || head === undefined || eyes === undefined || antenna === undefined) return
    service.registerParts({stage, head, eyes, antenna})
    service.mountEffect('led-cone', ledConeEffect)
  })

  createEffect(() => service.update(config()))

  onCleanup(() => service.destroy())

  return (
    <div
      ref={(element) => (stage = element)}
      style={stageStyle}
      role="img"
      aria-label="conciv robot mascot with an LED beacon cone effect"
    >
      <div ref={(element) => (head = element)} style={layerStyle(robotLayers.head)} />
      <div ref={(element) => (eyes = element)} style={layerStyle(robotLayers.eyes)} />
      <div ref={(element) => (antenna = element)} style={layerStyle(robotLayers.antenna)} />
    </div>
  )
}

const COMPONENT_DOCS = `
\`ledConeEffect\` mounts an accent LED dot with a light cone above the antenna tip; both pulse in and out of
opacity on a shared beat while work is in flight, then drain back into the tip when work stops. Toggle
**working** to see it mount and drain.
`

const meta: Meta<StageProps> = {
  title: 'mascot/Effects/LedCone',
  tags: ['autodocs'],
  parameters: {docs: {description: {component: COMPONENT_DOCS}}},
  args: {state: 'rest', working: true},
  argTypes: {
    state: {control: 'inline-radio', options: ['rest', 'awake'], description: 'Resting expression'},
    working: {control: 'boolean', description: 'Activity overlay: mounts the LED cone effect while true'},
  },
}
export default meta
type Story = StoryObj<StageProps>

export const Playground: Story = {
  render: (args) => <LedConeFrame state={args.state} working={args.working} />,
}
