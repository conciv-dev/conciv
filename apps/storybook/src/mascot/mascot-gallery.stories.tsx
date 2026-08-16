import {createEffect, For, type JSX, onCleanup, onMount, Show, untrack} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within} from 'storybook/test'
import {
  createMascot,
  robotLayers,
  type CurveStyle,
  type EffectMount,
  type MascotConfig,
  type MascotFollow,
  type MascotState,
} from '@conciv/mascot'
import {configureBinaryEffect} from '@conciv/mascot/effects/binary'
import {heartEffect} from '@conciv/mascot/effects/heart'
import {ledConeEffect} from '@conciv/mascot/effects/led-cone'
import {matrixEffect} from '@conciv/mascot/effects/matrix'
import {notesEffect} from '@conciv/mascot/effects/notes'
import {pixelBubblesEffect} from '@conciv/mascot/effects/pixel-bubbles'
import {satelliteEffect} from '@conciv/mascot/effects/satellite'
import {signalBarsEffect} from '@conciv/mascot/effects/signal-bars'
import {signalRingsEffect} from '@conciv/mascot/effects/signal-rings'
import {sparkEffect} from '@conciv/mascot/effects/spark'
import {sparkBurstEffect} from '@conciv/mascot/effects/spark-burst'
import {sparkFountainEffect} from '@conciv/mascot/effects/spark-fountain'
import {speechBubbleEffect} from '@conciv/mascot/effects/speech-bubble'
import {steamEffect} from '@conciv/mascot/effects/steam'
import {thoughtCloudEffect} from '@conciv/mascot/effects/thought-cloud'
import {tickRingEffect} from '@conciv/mascot/effects/tick-ring'

type EffectEntry = {name: string; summary: string; mount: (curve: CurveStyle) => EffectMount}

const BINARY_EFFECT: EffectEntry = {
  name: 'binary',
  summary: 'Five binary digits rise out of the antenna tip in two lanes and drain back into it.',
  mount: (curve) => configureBinaryEffect({curve}),
}

const EFFECTS: EffectEntry[] = [
  BINARY_EFFECT,
  {
    name: 'matrix',
    summary: 'Six monospace glyphs drip down out of the tip in a staggered falling column.',
    mount: () => matrixEffect,
  },
  {
    name: 'thought-cloud',
    summary: 'A comic thought bubble floats above the tip while three ink dots pulse.',
    mount: () => thoughtCloudEffect,
  },
  {
    name: 'pixel-bubbles',
    summary: 'Six pixel squares float up and drift apart in alternating lanes.',
    mount: () => pixelBubblesEffect,
  },
  {
    name: 'signal-rings',
    summary: 'Three concentric rings pulse outward from the tip and fade.',
    mount: () => signalRingsEffect,
  },
  {
    name: 'speech-bubble',
    summary: 'A comic speech bubble whose three dots flash in sequence, like a typing indicator.',
    mount: () => speechBubbleEffect,
  },
  {
    name: 'steam',
    summary: 'Four blurred puffs rise from the tip, drift into lanes, scale up and fade.',
    mount: () => steamEffect,
  },
  {
    name: 'spark',
    summary: 'Five spark chips flicker above the tip over a soft pulsing glow.',
    mount: () => sparkEffect,
  },
  {
    name: 'spark-burst',
    summary: 'A canvas draws ten radial strokes that ease outward and fade, on a loop.',
    mount: () => sparkBurstEffect,
  },
  {
    name: 'spark-fountain',
    summary: 'A canvas sprays gravity-arced sparks into a narrow upward cone.',
    mount: () => sparkFountainEffect,
  },
  {
    name: 'satellite',
    summary: 'A dashed orbit ring with a single accent dot circling the tip.',
    mount: () => satelliteEffect,
  },
  {
    name: 'led-cone',
    summary: 'An LED dot and its light cone pulse together on a shared beat.',
    mount: () => ledConeEffect,
  },
  {
    name: 'tick-ring',
    summary: 'A ring of twelve ticks lights up one at a time, clockwise.',
    mount: () => tickRingEffect,
  },
  {
    name: 'signal-bars',
    summary: 'Four bars step through a rising bar chart on a staggered beat.',
    mount: () => signalBarsEffect,
  },
  {
    name: 'heart',
    summary: 'A pixel heart pulses its scale on a yoyo loop.',
    mount: () => heartEffect,
  },
  {
    name: 'notes',
    summary: 'Three music glyphs launch from the tip and drift apart as they rise.',
    mount: () => notesEffect,
  },
]

const PARTS = [
  {name: 'stage', summary: 'The positioned box the layers fill; every emitter measures against it.'},
  {name: 'head', summary: 'The body layer: poses between rest and awake, and bobs while working.'},
  {name: 'eyes', summary: 'Tracks the pointer when follow is armed, and blinks on the work beat.'},
  {name: 'antenna', summary: 'Leans toward the pointer, throbs while working, and carries the emitter tip.'},
  {name: 'effect host', summary: 'A keyed box bound through getEffectHostProps(id); an effect renders into it.'},
]

const WRAPPERS = [
  {subpath: '@conciv/mascot', summary: 'The framework-free core: createMascot(config, skin) over plain DOM nodes.'},
  {
    subpath: '@conciv/mascot/solid',
    summary: 'The Solid compound component: <Mascot> with Head, Eyes, Antenna, Binary.',
  },
  {subpath: '@conciv/mascot/react', summary: 'The React mirror of the same compound component and slots.'},
]

const effectSubpath = (name: string): string => `@conciv/mascot/effects/${name}`

const effectEntry = (name: string): EffectEntry => EFFECTS.find((entry) => entry.name === name) ?? BINARY_EFFECT

const effectCountLabel = (count: number): string => {
  const plural = new Intl.PluralRules('en').select(count) === 'one' ? 'effect' : 'effects'
  return `${new Intl.NumberFormat('en').format(count)} ${plural}`
}

const EFFECT_HOST_ID = 'gallery'

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

const figureStyle = (sizePx: number): JSX.CSSProperties => ({
  display: 'flex',
  'flex-direction': 'column',
  'align-items': 'center',
  gap: '16px',
  'padding-block': `${Math.round(sizePx * HEADROOM_RATIO)}px 24px`,
})

const captionStyle: JSX.CSSProperties = {
  display: 'flex',
  'flex-direction': 'column',
  'align-items': 'center',
  gap: '4px',
  'font-size': '13px',
  'line-height': '1.5',
  'text-align': 'center',
  'text-wrap': 'balance',
  'overflow-wrap': 'anywhere',
}

const subpathStyle: JSX.CSSProperties = {'font-family': 'ui-monospace, monospace', opacity: '0.75'}

const sectionStyle: JSX.CSSProperties = {display: 'flex', 'flex-direction': 'column', gap: '16px'}

const listStyle: JSX.CSSProperties = {display: 'flex', 'flex-direction': 'column', gap: '12px'}

const rowStyle: JSX.CSSProperties = {display: 'flex', 'flex-direction': 'column', gap: '2px'}

const termStyle: JSX.CSSProperties = {'font-weight': '600', 'overflow-wrap': 'anywhere'}

const summaryStyle: JSX.CSSProperties = {'font-size': '13px', 'line-height': '1.5', opacity: '0.8'}

const headingStyle: JSX.CSSProperties = {
  'font-size': '12px',
  'font-weight': '600',
  'text-transform': 'uppercase',
  'letter-spacing': '0.08em',
  opacity: '0.6',
}

const titleStyle: JSX.CSSProperties = {'font-size': '18px', 'font-weight': '600'}

const FOLLOW_MODES: Record<GalleryProps['follow'], MascotFollow> = {
  both: true,
  eyes: {eyes: true, antenna: false},
  antenna: {eyes: false, antenna: true},
  none: false,
}

function GalleryStage(props: GalleryProps): JSX.Element {
  const config = (): MascotConfig => ({
    state: props.state,
    working: props.working,
    follow: FOLLOW_MODES[props.follow],
    activity: {bob: props.bob, throb: props.throb, blink: props.blink},
  })
  const service = createMascot(untrack(config))
  const host = service.connect().getEffectHostProps(EFFECT_HOST_ID)
  const label = () =>
    props.working
      ? `conciv robot mascot running the ${props.effect} effect`
      : `conciv robot mascot at rest, with the ${props.effect} effect mounted`
  let stage: HTMLDivElement | undefined
  let head: HTMLDivElement | undefined
  let eyes: HTMLDivElement | undefined
  let antenna: HTMLDivElement | undefined

  onMount(() => {
    if (stage === undefined || head === undefined || eyes === undefined || antenna === undefined) return
    service.registerParts({stage, head, eyes, antenna})
  })

  createEffect(() => service.mountEffect(EFFECT_HOST_ID, effectEntry(props.effect).mount(props.curve)))

  createEffect(() => service.update(config()))

  onCleanup(() => service.destroy())

  return (
    <div ref={(element) => (stage = element)} style={stageStyle(props.stageSizePx)} role="img" aria-label={label()}>
      <div ref={(element) => (head = element)} style={layerStyle(robotLayers.head)} />
      <div ref={(element) => (eyes = element)} style={layerStyle(robotLayers.eyes)} />
      <div ref={(element) => (antenna = element)} style={layerStyle(robotLayers.antenna)} />
      <span ref={host.ref} style={host.style} />
    </div>
  )
}

function GalleryFigure(props: GalleryProps): JSX.Element {
  return (
    <figure style={figureStyle(props.stageSizePx)}>
      <Show keyed when={props.stageSizePx}>
        <GalleryStage
          state={props.state}
          working={props.working}
          follow={props.follow}
          effect={props.effect}
          curve={props.curve}
          stageSizePx={props.stageSizePx}
          bob={props.bob}
          throb={props.throb}
          blink={props.blink}
        />
      </Show>
      <figcaption style={captionStyle}>
        <span style={subpathStyle}>{effectSubpath(props.effect)}</span>
        <span>{effectEntry(props.effect).summary}</span>
      </figcaption>
    </figure>
  )
}

function MascotIndex(): JSX.Element {
  return (
    <article style={{...sectionStyle, gap: '32px'}}>
      <div style={rowStyle}>
        <h1 style={titleStyle}>conciv mascot</h1>
        <p style={summaryStyle}>
          A rigged pixel robot: three layers a host renders, three controllers that drive them, and{' '}
          <strong>{effectCountLabel(EFFECTS.length)}</strong> that ride the antenna tip while work is in flight.
        </p>
      </div>
      <section style={sectionStyle}>
        <h2 style={headingStyle}>Parts</h2>
        <dl style={listStyle}>
          <For each={PARTS}>
            {(part) => (
              <div style={rowStyle}>
                <dt style={termStyle}>{part.name}</dt>
                <dd style={summaryStyle}>{part.summary}</dd>
              </div>
            )}
          </For>
        </dl>
      </section>
      <section style={sectionStyle}>
        <h2 style={headingStyle}>Effects</h2>
        <p style={summaryStyle}>Each effect is its own subpath entry, so a consumer bundles only the one it mounts.</p>
        <dl style={listStyle}>
          <For each={EFFECTS}>
            {(effect) => (
              <div style={rowStyle}>
                <dt style={{...termStyle, ...subpathStyle}}>{effectSubpath(effect.name)}</dt>
                <dd style={summaryStyle}>{effect.summary}</dd>
              </div>
            )}
          </For>
        </dl>
      </section>
      <section style={sectionStyle}>
        <h2 style={headingStyle}>Entries</h2>
        <dl style={listStyle}>
          <For each={WRAPPERS}>
            {(wrapper) => (
              <div style={rowStyle}>
                <dt style={{...termStyle, ...subpathStyle}}>{wrapper.subpath}</dt>
                <dd style={summaryStyle}>{wrapper.summary}</dd>
              </div>
            )}
          </For>
        </dl>
      </section>
    </article>
  )
}

type GalleryProps = {
  state: MascotState
  working: boolean
  follow: 'both' | 'eyes' | 'antenna' | 'none'
  effect: string
  curve: CurveStyle
  stageSizePx: number
  bob: boolean
  throb: boolean
  blink: boolean
}

const COMPONENT_DOCS = `
The gallery is the mascot as a consumer meets it: every import here is a published entry
(\`@conciv/mascot\` and \`@conciv/mascot/effects/<name>\`), never package source, so what the controls drive is
exactly what an app gets from npm.

**Playground** — the assembled robot over \`createMascot\`. \`state\` picks the resting expression, \`working\`
runs the activity overlay, \`follow\` arms pointer tracking per channel, \`bob\`/\`throb\`/\`blink\` isolate the
three overlay pieces, \`effect\` swaps which of the sixteen effects is mounted (switching drains the outgoing one
and starts the incoming one), \`curve\` picks the path travelling digits ride out of the antenna tip, and
\`stageSizePx\` resizes the stage — the emitter is scale-relative, so the whole effect grows with the robot.

**Index** — the map of the package: the parts a host renders, all sixteen effect subpaths, and the three
entries (core, Solid, React). Each per-effect story under **mascot/Effects** is the deep dive for one of them.

**Reduced motion** — under \`prefers-reduced-motion: reduce\` poses are set instantly, follow never arms and no
effect starts, so the robot here renders still. That is the core's behavior, not the story's: flip the setting in
the DevTools **Rendering** panel and reload to see it.
`

const meta: Meta<GalleryProps> = {
  title: 'mascot/Gallery',
  tags: ['autodocs'],
  parameters: {docs: {description: {component: COMPONENT_DOCS}}},
  args: {
    state: 'rest',
    working: true,
    follow: 'both',
    effect: 'binary',
    curve: 'straight',
    stageSizePx: 120,
    bob: true,
    throb: true,
    blink: true,
  },
  argTypes: {
    state: {control: 'inline-radio', options: ['rest', 'awake'], description: 'Resting expression'},
    working: {control: 'boolean', description: 'Activity overlay: head bob, antenna throb, eye blink, the effect'},
    follow: {
      control: 'inline-radio',
      options: ['both', 'eyes', 'antenna', 'none'],
      description: 'Which pointer-tracking channels are armed; armed only while not working',
    },
    effect: {
      control: 'select',
      options: EFFECTS.map((entry) => entry.name),
      description: 'Which published effect subpath is mounted on the keyed effect host',
    },
    curve: {
      control: 'inline-radio',
      options: ['straight', 'arc', 'hook', 'fan', 'auto'],
      description: 'The path travelling effects ride out of the antenna tip; anchored effects ignore it',
    },
    stageSizePx: {
      control: {type: 'range', min: 44, max: 320, step: 4},
      description: 'Stage box size; the emitter scales with it (44px is the widget FAB)',
    },
    bob: {control: 'boolean', description: 'activity.bob: the head, antenna and eyes rise and fall together'},
    throb: {control: 'boolean', description: 'activity.throb: the antenna stretches on the work beat'},
    blink: {control: 'boolean', description: 'activity.blink: the eyes close and open once a cycle'},
  },
}
export default meta
type Story = StoryObj<GalleryProps>

export const Playground: Story = {
  render: (args): JSX.Element => (
    <GalleryFigure
      state={args.state}
      working={args.working}
      follow={args.follow}
      effect={args.effect}
      curve={args.curve}
      stageSizePx={args.stageSizePx}
      bob={args.bob}
      throb={args.throb}
      blink={args.blink}
    />
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('img', {name: 'conciv robot mascot running the binary effect'})).toBeVisible()
    await expect(await canvas.findByText(effectSubpath('binary'))).toBeVisible()
  },
}

export const Index: Story = {
  parameters: {controls: {disable: true}},
  render: (): JSX.Element => <MascotIndex />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    for (const part of PARTS) await expect(await canvas.findByText(part.name)).toBeVisible()
    for (const effect of EFFECTS) await expect(await canvas.findByText(effectSubpath(effect.name))).toBeVisible()
    for (const wrapper of WRAPPERS) await expect(await canvas.findByText(wrapper.subpath)).toBeVisible()
    await expect(await canvas.findByText('16 effects')).toBeVisible()
  },
}
