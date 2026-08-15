import {createEffect, onCleanup, onMount, Show, untrack, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {matrixEffect} from './core/effects/matrix.js'
import {createMascot, robotLayers, type MascotConfig, type MascotFollow, type MascotState} from './rig.js'

const PRODUCT_FAB_ANTENNA_PX = 44

const DEFAULT_HEADROOM_RATIO = 1.6

const LAYER_STYLE: JSX.CSSProperties = {
  position: 'absolute',
  inset: '0',
  'background-repeat': 'no-repeat',
  'background-position': 'center',
  'background-size': 'contain',
  'image-rendering': 'pixelated',
}

const layerStyle = (image: string): JSX.CSSProperties => ({...LAYER_STYLE, 'background-image': `url('${image}')`})

const stageStyle = (sizePx: number): JSX.CSSProperties => ({
  position: 'relative',
  display: 'block',
  'inline-size': `${sizePx}px`,
  'block-size': `${sizePx}px`,
})

const frameStyle = (sizePx: number, headroomRatio: number): JSX.CSSProperties => ({
  display: 'flex',
  'flex-direction': 'column',
  'align-items': 'center',
  'padding-block-start': `${Math.round(sizePx * headroomRatio)}px`,
  'padding-block-end': '24px',
})

type FollowMode = 'both' | 'eyes' | 'antenna' | 'none'

const FOLLOW_MODES: Record<FollowMode, MascotFollow> = {
  both: true,
  eyes: {eyes: true, antenna: false},
  antenna: {eyes: false, antenna: true},
  none: false,
}

type StageProps = {state: MascotState; working: boolean; follow: FollowMode; stageSizePx: number}

function MascotStage(props: StageProps): JSX.Element {
  const config = (): MascotConfig => ({
    state: props.state,
    working: props.working,
    follow: FOLLOW_MODES[props.follow],
  })
  const service = createMascot(untrack(config))
  let stage: HTMLDivElement | undefined
  let head: HTMLDivElement | undefined
  let eyes: HTMLDivElement | undefined
  let antenna: HTMLDivElement | undefined

  onMount(() => {
    if (stage === undefined || head === undefined || eyes === undefined || antenna === undefined) return
    service.registerParts({stage, head, eyes, antenna})
  })

  createEffect(() => service.mountEffect('matrix', matrixEffect))

  createEffect(() => service.update(config()))

  onCleanup(() => service.destroy())

  return (
    <div
      ref={(element) => (stage = element)}
      style={stageStyle(props.stageSizePx)}
      role="img"
      aria-label="conciv robot mascot"
    >
      <div ref={(element) => (head = element)} style={layerStyle(robotLayers.head)} />
      <div ref={(element) => (eyes = element)} style={layerStyle(robotLayers.eyes)} />
      <div ref={(element) => (antenna = element)} style={layerStyle(robotLayers.antenna)} />
    </div>
  )
}

function MascotPlayground(props: StageProps): JSX.Element {
  const registrationKey = () => `${props.stageSizePx}|${props.state}`

  return (
    <div style={frameStyle(props.stageSizePx, DEFAULT_HEADROOM_RATIO)}>
      <Show keyed when={registrationKey()}>
        <MascotStage
          state={props.state}
          working={props.working}
          follow={props.follow}
          stageSizePx={props.stageSizePx}
        />
      </Show>
    </div>
  )
}

const COMPONENT_DOCS = `
\`matrixEffect\` mounts six monospace glyphs (\`0179 42\`) that drip down out of the antenna tip in a falling
column, each staggered 0.32s behind the last on a 1.9s cycle, fading in then mostly out as they fall — a nod to
the "digital rain" look. Toggle **working** on to see it mount; it stays anchored to the antenna tip as the
robot leans. Ported verbatim from the \`MatrixDrip\` story prototype: same glyph set, color (\`#4ade80\`), and
timing, scaled by the antenna factor so it renders identically at 44px.
`

const meta: Meta<StageProps> = {
  title: 'mascot/Effects/Matrix',
  tags: ['autodocs'],
  parameters: {docs: {description: {component: COMPONENT_DOCS}}},
  args: {
    state: 'rest',
    working: true,
    follow: 'both',
    stageSizePx: 120,
  },
  argTypes: {
    state: {control: 'inline-radio', options: ['rest', 'awake'], description: 'Resting expression'},
    working: {control: 'boolean', description: 'Activity overlay; the matrix effect only mounts while working'},
    follow: {
      control: 'inline-radio',
      options: ['both', 'eyes', 'antenna', 'none'],
      description: 'Which pointer-tracking channels are armed; armed only while not working',
    },
    stageSizePx: {
      control: {type: 'range', min: PRODUCT_FAB_ANTENNA_PX, max: 320, step: 4},
      description: 'Stage box size; the effect scales with it (44px = the widget FAB)',
    },
  },
}
export default meta
type Story = StoryObj<StageProps>

export const Playground: Story = {
  render: (args) => (
    <MascotPlayground state={args.state} working={args.working} follow={args.follow} stageSizePx={args.stageSizePx} />
  ),
}
