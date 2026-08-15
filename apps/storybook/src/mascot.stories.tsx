import {createEffect, onCleanup, onMount, Show, untrack, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {
  binaryEffect,
  createMascot,
  robotLayers,
  type MascotConfig,
  type MascotFollow,
  type MascotState,
} from '@conciv/mascot'

const PRODUCT_FAB_ANTENNA_PX = 44

const HEADROOM_RATIO = 1.6

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

const frameStyle = (sizePx: number): JSX.CSSProperties => ({
  display: 'flex',
  'flex-direction': 'column',
  'align-items': 'center',
  'padding-block-start': `${Math.round(sizePx * HEADROOM_RATIO)}px`,
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

type StageProps = {state: MascotState; working: boolean; follow: FollowMode; stageSizePx: number}

type PlaygroundProps = StageProps & {poseApply: PoseApply}

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
    service.mountEffect('binary', binaryEffect)
  })

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
  const registrationKey = () => `${props.stageSizePx}|${props.poseApply === 'set' ? props.state : 'animate'}`

  return (
    <div style={frameStyle(props.stageSizePx)}>
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
to ride the antenna tip exposes an optional \`anchor(tip)\`; anchored effects simply omit it.
\`binaryEffect\` is the one effect shipped so far and is what this story mounts: five binary
digits rise out of the antenna tip in two lanes, stay anchored to the tip as the antenna leans, and drain back
into it when work stops.

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
  args: {state: 'rest', working: false, follow: 'both', stageSizePx: 120, poseApply: 'animate'},
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
    />
  ),
}
