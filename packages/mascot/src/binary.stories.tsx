import {createEffect, onCleanup, onMount, Show, untrack, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {configureBinaryEffect} from './core/effects/binary.js'
import {
  createMascot,
  robotLayers,
  type CurveStyle,
  type MascotConfig,
  type MascotFollow,
  type MascotState,
} from './core/index.js'

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

type StageProps = {
  state: MascotState
  working: boolean
  follow: FollowMode
  stageSizePx: number
  curve: CurveStyle
  bob: boolean
  throb: boolean
  blink: boolean
}

function MascotStage(props: StageProps): JSX.Element {
  const config = (): MascotConfig => ({
    state: props.state,
    working: props.working,
    follow: FOLLOW_MODES[props.follow],
    activity: {bob: props.bob, throb: props.throb, blink: props.blink},
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

  createEffect(() => service.mountEffect('binary', configureBinaryEffect({curve: props.curve})))

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
          curve={props.curve}
          bob={props.bob}
          throb={props.throb}
          blink={props.blink}
        />
      </Show>
    </div>
  )
}

const COMPONENT_DOCS = `
\`binaryEffect\` mounts five binary digits (alternating \`1\`/\`0\`) that rise out of the antenna tip in two
staggered lanes, each staggered 0.42s behind the last on a 2.2s cycle, fading in then out as they climb — the
shipped FAB effect, unchanged at \`curve: 'straight'\`. Toggle **working** on to see it mount; it stays anchored
to the antenna tip as the robot leans. \`configureBinaryEffect({curve})\` swaps the straight vertical rise for a
bent path: **arc** eases the
digits into the open side, **hook** climbs the axis then turns a corner, **fan** spreads every digit into its
own lane, and **auto** measures the room above the antenna tip and picks straight or bent accordingly. Changing
**curve** here re-mounts the effect, matching how the Core Playground story remounts on a curve change: an
effect's rider paths are fixed at mount, not live. **bob**, **throb** and **blink** switch off the matching
piece of the activity overlay, which is the quickest way to watch the digits launch from a tip that never moves:
turn **throb** and **bob** off and the tip holds still while the digits keep rising out of it.
`

const meta: Meta<StageProps> = {
  title: 'mascot/Effects/Binary',
  tags: ['autodocs'],
  parameters: {docs: {description: {component: COMPONENT_DOCS}}},
  args: {
    state: 'rest',
    working: true,
    follow: 'both',
    stageSizePx: 120,
    curve: 'straight',
    bob: true,
    throb: true,
    blink: true,
  },
  argTypes: {
    state: {control: 'inline-radio', options: ['rest', 'awake'], description: 'Resting expression'},
    working: {control: 'boolean', description: 'Activity overlay; the binary effect only mounts while working'},
    follow: {
      control: 'inline-radio',
      options: ['both', 'eyes', 'antenna', 'none'],
      description: 'Which pointer-tracking channels are armed; armed only while not working',
    },
    stageSizePx: {
      control: {type: 'range', min: PRODUCT_FAB_ANTENNA_PX, max: 320, step: 4},
      description: 'Stage box size; the effect scales with it (44px = the widget FAB)',
    },
    curve: {
      control: 'inline-radio',
      options: ['straight', 'arc', 'hook', 'fan', 'auto'],
      description: 'The path the digits ride out of the antenna tip',
    },
    bob: {control: 'boolean', description: 'activity.bob: the head, antenna and eyes rise and fall together'},
    throb: {control: 'boolean', description: 'activity.throb: the antenna stretches on the work beat'},
    blink: {control: 'boolean', description: 'activity.blink: the eyes close and open once a cycle'},
  },
}
export default meta
type Story = StoryObj<StageProps>

export const Playground: Story = {
  render: (args) => (
    <MascotPlayground
      state={args.state}
      working={args.working}
      follow={args.follow}
      stageSizePx={args.stageSizePx}
      curve={args.curve}
      bob={args.bob}
      throb={args.throb}
      blink={args.blink}
    />
  ),
}
