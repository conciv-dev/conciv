import {createEffect, onCleanup, onMount, untrack, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {steamEffect} from './core/effects/steam.js'
import {createMascot, robotLayers, type MascotConfig, type MascotState} from './core/index.js'

const STAGE_SIZE_PX = 120

const HEADROOM_PX = 200

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

function SteamStage(props: StageProps): JSX.Element {
  const config = (): MascotConfig => ({state: props.state, working: props.working, follow: false})
  const service = createMascot(untrack(config))
  let stage: HTMLDivElement | undefined
  let head: HTMLDivElement | undefined
  let eyes: HTMLDivElement | undefined
  let antenna: HTMLDivElement | undefined

  onMount(() => {
    if (stage === undefined || head === undefined || eyes === undefined || antenna === undefined) return
    service.registerParts({stage, head, eyes, antenna})
    service.mountEffect('steam', steamEffect)
  })

  createEffect(() => service.update(config()))

  onCleanup(() => service.destroy())

  return (
    <div
      ref={(element) => (stage = element)}
      style={stageStyle}
      role="img"
      aria-label="conciv robot mascot venting steam puffs while working"
    >
      <div ref={(element) => (head = element)} style={layerStyle(robotLayers.head)} />
      <div ref={(element) => (eyes = element)} style={layerStyle(robotLayers.eyes)} />
      <div ref={(element) => (antenna = element)} style={layerStyle(robotLayers.antenna)} />
    </div>
  )
}

const COMPONENT_DOCS = `
\`steamEffect\` mounts four blurred puffs at the antenna tip that rise, drift into alternating lanes,
scale up and fade, staggered 0.6s apart on a 2.4s loop (\`sine.out\`, opacity keyframes
\`[0, 0.7, 0.5, 0]\`). Ported mechanically from the \`SteamPuffs\` story prototype ("Steam puffs"): same
puff count, rise distance, lane offsets and timing, scaled to the antenna's box size the way
\`binaryEffect\` scales its digits. Toggle **working** to see the puffs enter from the tip, loop, and
drain back into it when work stops.
`

const meta: Meta<StageProps> = {
  title: 'mascot/Effects/Steam',
  tags: ['autodocs'],
  parameters: {docs: {description: {component: COMPONENT_DOCS}}},
  args: {state: 'rest', working: true},
  argTypes: {
    state: {control: 'inline-radio', options: ['rest', 'awake'], description: 'Resting expression'},
    working: {control: 'boolean', description: 'Activity overlay: mounts the steam puffs effect'},
  },
}
export default meta
type Story = StoryObj<StageProps>

export const Playground: Story = {
  render: (args) => (
    <div style={frameStyle}>
      <SteamStage state={args.state} working={args.working} />
    </div>
  ),
}
