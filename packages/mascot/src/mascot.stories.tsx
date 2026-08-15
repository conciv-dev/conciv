import {createEffect, onCleanup, onMount, Show, untrack, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {
  configureBinaryEffect,
  createMascot,
  robotLayers,
  type CurveStyle,
  type MascotConfig,
  type MascotFollow,
  type MascotState,
} from './rig.js'

const PRODUCT_FAB_ANTENNA_PX = 44

const DEFAULT_HEADROOM_PX = 192

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

const frameStyle = (headroomPx: number): JSX.CSSProperties => ({
  display: 'flex',
  'flex-direction': 'column',
  'align-items': 'center',
  'padding-block-start': `${headroomPx}px`,
  'padding-block-end': '24px',
})

type PoseApply = 'animate' | 'set'

type FollowMode = 'both' | 'eyes' | 'antenna' | 'none'

const FOLLOW_MODES: Record<FollowMode, MascotFollow> = {
  both: true,
  eyes: {eyes: true, antenna: false},
  antenna: {eyes: false, antenna: true},
  none: false,
}

type StageProps = {state: MascotState; working: boolean; follow: FollowMode; stageSizePx: number; curve: CurveStyle}

type PlaygroundProps = StageProps & {poseApply: PoseApply; headroomPx: number}

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

function MascotPlayground(props: PlaygroundProps): JSX.Element {
  const registrationKey = () =>
    `${props.stageSizePx}|${props.headroomPx}|${props.poseApply === 'set' ? props.state : 'animate'}`

  return (
    <div style={frameStyle(props.headroomPx)}>
      <Show keyed when={registrationKey()}>
        <MascotStage
          state={props.state}
          working={props.working}
          follow={props.follow}
          stageSizePx={props.stageSizePx}
          curve={props.curve}
        />
      </Show>
    </div>
  )
}

const COMPONENT_DOCS = `
\`createMascot(config)\` is the framework-free mascot core. It needs nothing but DOM nodes, so this story
drives it directly: no wrapper component sits in between. Move the pointer near the robot to see the gaze,
and flip the controls to see every cell of the state x working matrix.

**Service** — \`createMascot(config, skin?)\` returns
\`{update, registerParts, mountEffect, unmountEffect, connect, destroy}\`.
\`registerParts({stage, head, eyes, antenna})\` attaches the core to the elements you rendered, and calling it
again with the same nodes is a no-op. \`update(config)\` diffs the next config against the current one and runs
only the transitions that changed. \`connect()\` is the wrapper-facing surface: per-part \`{style, ref}\` getters
a Solid or React wrapper spreads onto its own elements, plus \`getEffectHostProps(id)\` for a keyed effect host.
\`destroy()\` disposes every controller and is terminal.

**Config** — \`state\` is the resting expression, \`'rest'\` or \`'awake'\`. \`working\` turns the activity
overlay on. \`follow\` asks for pointer tracking, either as one boolean or per channel
(\`{eyes, antenna}\`); a channel is armed only while it is asked for and \`!working\`, because work owns the
antenna. Flip the follow control here to watch one channel track while the other stays still.

**Controllers** — three independent controllers share the same elements. Pose owns the resting expression and
animates between rest and awake. Follow moves the eyes and leans the antenna toward the pointer. Activity owns
everything that happens while work is in flight: the head bob, the antenna throb, the eye blink, and every
mounted effect. Head \`yPercent\` and eye \`scaleY\` are handoff channels: activity owns them while working and
hands them back to the pose value with a short recovery when work stops.

**Effects** — the core mounts nothing on its own. \`mountEffect(id, mount)\` registers an effect and activity
drives it on every working edge, so two mounted effects mean two live emitters; \`unmountEffect(id)\` drains it.
An effect renders into the host bound to its id through \`getEffectHostProps(id)\`, falling back to the stage.
A mount receives one \`EffectContext\` (\`{host, stage, antenna, skin}\`) from the core, and an effect that wants
to ride the antenna tip exposes an optional \`anchor(tip)\`; un-anchored effects simply omit it.
\`binaryEffect\` is the one effect shipped so far and is what this story mounts: five binary
digits rise out of the antenna tip in two lanes, stay anchored to the tip as the antenna leans, and drain back
into it when work stops.

**Effect config** — an effect carries its own configuration; the core never learns about it. \`binaryEffect\` is
the bare default mount, and \`configureBinaryEffect({curve})\` returns an \`EffectMount\` closed over the
configuration you picked. \`mountEffect(id, mount)\` takes either one, so \`mountEffect\`'s signature never grows
a config argument and every future effect follows the same two-export shape.

**Curve** — \`curve\` picks the path the digits ride out of the tip. \`straight\` is the default and the shipped
FAB behavior: a plain vertical rise, unchanged. \`arc\` leaves the tip along the antenna axis and eases into the
open side, \`hook\` climbs the axis, turns a corner and runs sideways, and \`fan\` gives every digit its own lane
so the five spread apart. \`auto\` measures instead of guessing: the gap between the antenna tip and the
viewport decides, so a robot with room above rises straight and a robot squeezed against the top bends toward
whichever side has more room. Every curved digit tilts with its tangent, and every curve leaves the tip
vertically, so the launch looks the same whichever style is running. The room is measured in stage-local
coordinates once per emitter start, not live on scroll or resize, and the whole curve scales with the same
antenna factor as the rest of the emitter.

**Headroom** — a curve only bends when the room says it must, so with space above the robot every style
degrades to the plain vertical rise. Drag \`headroomPx\` down with \`working\` on to squeeze the emitter against
the top of the frame and watch the curves appear, \`auto\` flip from straight to bent, and the bend follow
whichever side has more room. The measurement happens when the emitter starts, so changing the headroom
re-registers the stage rather than bending a curve that is already in flight.

**Skin** — every art-coupled value (layer images, transform origins, the antenna origin and tip fractions, the
awake eye scale, the emitter's reference antenna size) lives in one \`MascotSkin\`, defaulting to
\`robotSkin\`. Motion timing and eases are behavior, not art, so they stay in the core.

**Stage size** — the emitter is scale-relative. Every emitter distance (digit size, the two lane offsets, the
digit placement, the rise) is the approved value multiplied by \`min(antennaWidth, antennaHeight) / 44\`. The
reference is the antenna layer's own box, not the stage: the widget FAB fills its 44px stage with the antenna,
while the site FAB insets a 44px antenna inside a 56px button, and both must render the same emitter. Here the
layers sit at \`inset: 0\`, so the antenna box tracks \`stageSizePx\` — drag it and the digits grow with the
robot instead of staying 9px specks on a 320px stage. Rise duration, stagger and eases are timing, not
geometry, so they never scale. At 44px the factor is exactly 1 and the output is the shipped FAB, unchanged.

**Pose apply** — \`animate\` routes a \`state\` change through \`update()\`, which runs the pose transition.
\`set\` routes it through the registration path instead: the parts are registered again, and registration
always lands the pose instantly. Changing \`stageSizePx\` also re-registers, because the emitter reads its
scale factor off the antenna box when it is created.

**Reduced motion** — under \`prefers-reduced-motion: reduce\` poses are set instantly, follow never arms, and
the activity overlay starts no timelines and no effects, so the emitter never appears. There is no control for
it here: \`prefers-reduced-motion\` is a browser-level media query that page script cannot flip, and faking it
in the story would demo the story rather than the core. Toggle it in the OS accessibility settings, or in the
DevTools **Rendering** panel ("Emulate CSS prefers-reduced-motion"), then reload the story.
`

const meta: Meta<PlaygroundProps> = {
  title: 'mascot/Core',
  tags: ['autodocs'],
  parameters: {docs: {description: {component: COMPONENT_DOCS}}},
  args: {
    state: 'rest',
    working: false,
    follow: 'both',
    stageSizePx: 120,
    poseApply: 'animate',
    curve: 'straight',
    headroomPx: DEFAULT_HEADROOM_PX,
  },
  argTypes: {
    state: {control: 'inline-radio', options: ['rest', 'awake'], description: 'Resting expression'},
    working: {
      control: 'boolean',
      description: 'Activity overlay: head bob, antenna throb, eye blink, mounted effects',
    },
    follow: {
      control: 'inline-radio',
      options: ['both', 'eyes', 'antenna', 'none'],
      description: 'Which pointer-tracking channels are armed; armed only while not working',
    },
    stageSizePx: {
      control: {type: 'range', min: PRODUCT_FAB_ANTENNA_PX, max: 320, step: 4},
      description: 'Stage box size; the layers fill it, so the emitter scales with it (44px = the widget FAB)',
    },
    curve: {
      control: 'inline-radio',
      options: ['straight', 'arc', 'hook', 'fan', 'auto'],
      description: 'The path the emitter digits ride out of the antenna tip',
    },
    headroomPx: {
      control: {type: 'range', min: 0, max: 320, step: 8},
      description: 'Space above the robot; shrink it to squeeze the emitter and watch the curves bend',
    },
    poseApply: {
      control: 'inline-radio',
      options: ['animate', 'set'],
      description: 'Apply a state change through update() (animated) or through registration (instant)',
    },
  },
}
export default meta
type Story = StoryObj<PlaygroundProps>

export const Playground: Story = {
  render: (args) => (
    <MascotPlayground
      state={args.state}
      working={args.working}
      follow={args.follow}
      stageSizePx={args.stageSizePx}
      poseApply={args.poseApply}
      curve={args.curve}
      headroomPx={args.headroomPx}
    />
  ),
}
