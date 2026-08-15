import {createEffect, onCleanup, onMount, untrack, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {createMascot, robotLayers, type MascotConfig, type MascotState} from '@conciv/mascot'

const STAGE_SIZE_PX = 120

const HEADROOM_PX = 140

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

type StageProps = {state: MascotState; working: boolean; follow: boolean}

function MascotStage(props: StageProps): JSX.Element {
  const config = (): MascotConfig => ({state: props.state, working: props.working, follow: props.follow})
  const service = createMascot(untrack(config))
  let stage: HTMLDivElement | undefined
  let head: HTMLDivElement | undefined
  let eyes: HTMLDivElement | undefined
  let antenna: HTMLDivElement | undefined

  onMount(() => {
    if (stage === undefined || head === undefined || eyes === undefined || antenna === undefined) return
    service.registerParts({stage, head, eyes, antenna})
  })

  createEffect(() => service.update(config()))

  onCleanup(() => service.destroy())

  return (
    <div ref={(element) => (stage = element)} style={stageStyle} role="img" aria-label="conciv robot mascot">
      <div ref={(element) => (head = element)} style={layerStyle(robotLayers.head)} />
      <div ref={(element) => (eyes = element)} style={layerStyle(robotLayers.eyes)} />
      <div ref={(element) => (antenna = element)} style={layerStyle(robotLayers.antenna)} />
    </div>
  )
}

const COMPONENT_DOCS = `
\`createMascot(config)\` is the framework-free mascot core. It needs nothing but DOM nodes, so this story
drives it directly: no wrapper component sits in between. Move the pointer near the robot to see the gaze,
and flip the controls to see every cell of the state x working matrix.

**Service** — \`createMascot(config)\` returns \`{update, registerParts, connect, destroy}\`.
\`registerParts({stage, head, eyes, antenna, effectHost?})\` attaches the core to the elements you rendered,
and calling it again with the same nodes is a no-op. \`update(config)\` diffs the next config against the
current one and runs only the transitions that changed. \`connect()\` is the wrapper-facing surface: per-part
\`{style, ref}\` getters a Solid or React wrapper spreads onto its own elements, used from phase 2 onward.
\`destroy()\` disposes every controller and is terminal.

**Config** — \`state\` is the resting expression, \`'rest'\` or \`'awake'\`. \`working\` turns the activity
overlay on. \`follow\` asks for pointer tracking; it is armed only while \`follow && !working\`, because work
owns the antenna.

**Controllers** — three independent controllers share the same elements. Pose owns the resting expression and
animates between rest and awake. Follow moves the eyes and leans the antenna toward the pointer. Activity owns
everything that happens while work is in flight: the antenna throb, the eye blink, and the running effect.

**Binary emitter** — the one effect shipped in phase 1. Five binary digits rise out of the antenna tip in two
lanes, stay anchored to the tip as the antenna leans, and drain back into it when work stops.

**Reduced motion** — under \`prefers-reduced-motion: reduce\` poses are set instantly, follow never arms, and
the activity overlay starts no timelines and no effects, so the emitter never appears.
`

const meta: Meta<StageProps> = {
  title: 'mascot/Core',
  tags: ['autodocs'],
  parameters: {docs: {description: {component: COMPONENT_DOCS}}},
  args: {state: 'rest', working: false, follow: true},
  argTypes: {
    state: {control: 'inline-radio', options: ['rest', 'awake'], description: 'Resting expression'},
    working: {control: 'boolean', description: 'Activity overlay: antenna throb, eye blink, binary emitter'},
    follow: {control: 'boolean', description: 'Pointer tracking, armed only while not working'},
  },
}
export default meta
type Story = StoryObj<StageProps>

export const Playground: Story = {
  render: (args) => (
    <div style={frameStyle}>
      <MascotStage state={args.state} working={args.working} follow={args.follow} />
    </div>
  ),
}
