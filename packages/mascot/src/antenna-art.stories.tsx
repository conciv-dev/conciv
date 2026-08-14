import {createEffect, createSignal, onCleanup, onMount, For, Show, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import gsap from 'gsap'
import {createFabRobotRig, robotLayers, type FabRobotRig, type RigState} from './rig.js'

const meta: Meta = {title: 'mascot/AntennaArt'}
export default meta
type Story = StoryObj

const STAGE_SIZE_PX = 44

const ANTENNA_PIXEL_SIZE = 128

const TIP_LEFT = 54

const TIP_RIGHT = 73

const TIP_TOP = 12

const TIP_BOTTOM = 27

const TIP_OUTLINE_SUM = 150

const GLOW_SCALE = 2.1

const UPPER_BALL_OFFSET = -13

const chromeBorderColor = 'rgba(128, 134, 156, 0.45)'

const tipPalette: [number, number, number][] = [
  [224, 33, 138],
  [56, 214, 232],
  [255, 210, 63],
]

const chargeStages = [0.25, 0.5, 0.75, 1]

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

function createPixelCanvas(): {canvas: HTMLCanvasElement; context: CanvasRenderingContext2D} {
  const canvas = document.createElement('canvas')
  canvas.width = ANTENNA_PIXEL_SIZE
  canvas.height = ANTENNA_PIXEL_SIZE
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('canvas 2d context unavailable')
  context.imageSmoothingEnabled = false
  return {canvas, context}
}

async function readAntennaPixels(): Promise<ImageData> {
  const image = new Image()
  image.src = robotLayers.antenna
  await image.decode()
  const {context} = createPixelCanvas()
  context.drawImage(image, 0, 0)
  return context.getImageData(0, 0, ANTENNA_PIXEL_SIZE, ANTENNA_PIXEL_SIZE)
}

function clonePixels(pixels: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height)
}

function toSpriteUrl(pixels: ImageData): string {
  const {canvas, context} = createPixelCanvas()
  context.putImageData(pixels, 0, 0)
  return canvas.toDataURL()
}

const insideTip = (x: number, y: number) => x >= TIP_LEFT && x <= TIP_RIGHT && y >= TIP_TOP && y <= TIP_BOTTOM

function eachPixel(pixels: ImageData, visit: (index: number, x: number, y: number) => void): void {
  for (let y = 0; y < pixels.height; y += 1) {
    for (let x = 0; x < pixels.width; x += 1) visit((y * pixels.width + x) * 4, x, y)
  }
}

function maskedSprite(pixels: ImageData, keepTip: boolean): ImageData {
  const result = clonePixels(pixels)
  eachPixel(result, (index, x, y) => {
    if (insideTip(x, y) === keepTip) return
    result.data[index + 3] = 0
  })
  return result
}

const channel = (data: Uint8ClampedArray, index: number) => data[index] ?? 0

function paintTip(pixels: ImageData, color: [number, number, number], fromRow: number): ImageData {
  const result = maskedSprite(pixels, true)
  eachPixel(result, (index, x, y) => {
    if (!insideTip(x, y) || y < fromRow) return
    if (channel(result.data, index + 3) < 8) return
    const brightness = channel(result.data, index) + channel(result.data, index + 1) + channel(result.data, index + 2)
    if (brightness < TIP_OUTLINE_SUM) return
    result.data[index] = color[0]
    result.data[index + 1] = color[1]
    result.data[index + 2] = color[2]
  })
  return result
}

function hollowTip(pixels: ImageData): ImageData {
  const base = maskedSprite(pixels, true)
  const result = clonePixels(base)
  const alphaAt = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= ANTENNA_PIXEL_SIZE || y >= ANTENNA_PIXEL_SIZE) return 0
    return channel(base.data, (y * ANTENNA_PIXEL_SIZE + x) * 4 + 3)
  }
  eachPixel(result, (index, x, y) => {
    if (alphaAt(x, y) < 8) return
    if (alphaAt(x - 1, y) < 8 || alphaAt(x + 1, y) < 8 || alphaAt(x, y - 1) < 8 || alphaAt(x, y + 1) < 8) return
    result.data[index + 3] = 0
  })
  return result
}

function scaledTipUrl(tipPixels: ImageData, scale: number): string {
  const source = createPixelCanvas()
  source.context.putImageData(tipPixels, 0, 0)
  const {canvas, context} = createPixelCanvas()
  const centerX = (TIP_LEFT + TIP_RIGHT + 1) / 2
  const centerY = (TIP_TOP + TIP_BOTTOM + 1) / 2
  context.translate(centerX, centerY)
  context.scale(scale, scale)
  context.translate(-centerX, -centerY)
  context.drawImage(source.canvas, 0, 0)
  return canvas.toDataURL()
}

function shiftedTipUrl(tipPixels: ImageData, offsetY: number): string {
  const source = createPixelCanvas()
  source.context.putImageData(tipPixels, 0, 0)
  const {canvas, context} = createPixelCanvas()
  context.drawImage(source.canvas, 0, offsetY)
  return canvas.toDataURL()
}

type AntennaSprites = {
  stick: string
  tip: string
  tipColors: string[]
  glow: string
  charge: string[]
  hollow: string
  upperBall: string
}

let spritesPromise: Promise<AntennaSprites> | undefined

async function deriveSprites(): Promise<AntennaSprites> {
  const pixels = await readAntennaPixels()
  const tipHeight = TIP_BOTTOM - TIP_TOP + 1
  return {
    stick: toSpriteUrl(maskedSprite(pixels, false)),
    tip: toSpriteUrl(maskedSprite(pixels, true)),
    tipColors: tipPalette.map((color) => toSpriteUrl(paintTip(pixels, color, TIP_TOP))),
    glow: scaledTipUrl(paintTip(pixels, tipPalette[0] ?? [224, 33, 138], TIP_TOP), GLOW_SCALE),
    charge: chargeStages.map((fraction) =>
      toSpriteUrl(paintTip(pixels, [120, 255, 180], TIP_BOTTOM + 1 - Math.round(tipHeight * fraction))),
    ),
    hollow: toSpriteUrl(hollowTip(pixels)),
    upperBall: shiftedTipUrl(maskedSprite(pixels, true), UPPER_BALL_OFFSET),
  }
}

function antennaSprites(): Promise<AntennaSprites> {
  if (spritesPromise === undefined) spritesPromise = deriveSprites()
  return spritesPromise
}

const stageStyle: JSX.CSSProperties = {
  display: 'inline-block',
  position: 'relative',
  width: `${STAGE_SIZE_PX}px`,
  height: `${STAGE_SIZE_PX}px`,
}

function layerStyle(image: string): JSX.CSSProperties {
  return {
    position: 'absolute',
    inset: '0',
    'background-image': `url('${image}')`,
    'background-repeat': 'no-repeat',
    'background-position': 'center',
    'background-size': 'contain',
    'image-rendering': 'pixelated',
  }
}

const groupStyle: JSX.CSSProperties = {position: 'absolute', inset: '0', 'will-change': 'transform'}

function ArtStage(props: {state: RigState; children: JSX.Element}): JSX.Element {
  let headElement: HTMLSpanElement | undefined
  let eyesElement: HTMLSpanElement | undefined
  let groupElement: HTMLSpanElement | undefined
  let rig: FabRobotRig | undefined

  onMount(() => {
    if (!headElement || !eyesElement || !groupElement) return
    rig = createFabRobotRig({head: headElement, eyes: eyesElement, antenna: groupElement})
    createEffect(() => {
      rig?.apply(props.state)
    })
  })
  onCleanup(() => rig?.destroy())

  return (
    <span style={stageStyle} aria-hidden="true">
      <span style={layerStyle(robotLayers.head)} ref={(element) => (headElement = element)} />
      <span style={groupStyle} ref={(element) => (groupElement = element)}>
        {props.children}
      </span>
      <span style={layerStyle(robotLayers.eyes)} ref={(element) => (eyesElement = element)} />
    </span>
  )
}

function cycleLayers(elements: HTMLElement[], holdSeconds: number): gsap.core.Timeline {
  const timeline = gsap.timeline({repeat: -1})
  timeline.to({}, {duration: holdSeconds * elements.length}, 0)
  elements.forEach((element, index) => {
    timeline.set(elements, {opacity: 0}, index * holdSeconds)
    timeline.set(element, {opacity: 1}, index * holdSeconds)
  })
  return timeline
}

type StageProps = {state: RigState; sprites: AntennaSprites}

function LedTipBlink(props: StageProps): JSX.Element {
  let tipElement: HTMLSpanElement | undefined
  let timeline: gsap.core.Timeline | undefined

  createEffect(() => {
    const working = props.state === 'work'
    const element = tipElement
    timeline?.kill()
    timeline = undefined
    if (element === undefined) return
    gsap.set(element, {opacity: 1})
    if (!working || prefersReducedMotion()) return
    timeline = gsap.timeline()
    timeline.to(element, {opacity: 0.12, duration: 0.42, ease: 'steps(1)', yoyo: true, repeat: -1}, 0)
  })
  onCleanup(() => timeline?.kill())

  return (
    <ArtStage state={props.state}>
      <span style={layerStyle(props.sprites.stick)} />
      <span style={layerStyle(props.sprites.tip)} ref={(element) => (tipElement = element)} />
    </ArtStage>
  )
}

function TipColorCycle(props: StageProps): JSX.Element {
  const colorElements: HTMLSpanElement[] = []
  let timeline: gsap.core.Timeline | undefined

  createEffect(() => {
    const working = props.state === 'work'
    timeline?.kill()
    timeline = undefined
    if (colorElements.length === 0) return
    gsap.set(colorElements, {opacity: 0})
    gsap.set(colorElements[0] ?? colorElements, {opacity: 1})
    if (!working || prefersReducedMotion()) return
    timeline = cycleLayers(colorElements, 0.55)
  })
  onCleanup(() => timeline?.kill())

  return (
    <ArtStage state={props.state}>
      <span style={layerStyle(props.sprites.stick)} />
      <For each={props.sprites.tipColors}>
        {(sprite) => <span style={layerStyle(sprite)} ref={(element) => colorElements.push(element)} />}
      </For>
    </ArtStage>
  )
}

function GlowTip(props: StageProps): JSX.Element {
  let glowElement: HTMLSpanElement | undefined
  let timeline: gsap.core.Timeline | undefined

  createEffect(() => {
    const working = props.state === 'work'
    const element = glowElement
    timeline?.kill()
    timeline = undefined
    if (element === undefined) return
    gsap.set(element, {opacity: working ? 0.5 : 0.2, scale: 1})
    if (!working || prefersReducedMotion()) return
    timeline = gsap.timeline()
    timeline.to(element, {opacity: 0.9, scale: 1.15, duration: 0.7, ease: 'sine.inOut', yoyo: true, repeat: -1}, 0)
  })
  onCleanup(() => timeline?.kill())

  return (
    <ArtStage state={props.state}>
      <span
        style={{...layerStyle(props.sprites.glow), filter: 'blur(2.5px)', opacity: '0.5'}}
        ref={(element) => (glowElement = element)}
      />
      <span style={layerStyle(props.sprites.stick)} />
      <span style={layerStyle(props.sprites.tip)} />
    </ArtStage>
  )
}

function ChargingTip(props: StageProps): JSX.Element {
  const stageElements: HTMLSpanElement[] = []
  let timeline: gsap.core.Timeline | undefined

  createEffect(() => {
    const working = props.state === 'work'
    timeline?.kill()
    timeline = undefined
    if (stageElements.length === 0) return
    gsap.set(stageElements, {opacity: 0})
    gsap.set(stageElements[0] ?? stageElements, {opacity: 1})
    if (!working || prefersReducedMotion()) return
    timeline = cycleLayers(stageElements, 0.3)
  })
  onCleanup(() => timeline?.kill())

  return (
    <ArtStage state={props.state}>
      <span style={layerStyle(props.sprites.stick)} />
      <For each={props.sprites.charge}>
        {(sprite) => <span style={layerStyle(sprite)} ref={(element) => stageElements.push(element)} />}
      </For>
    </ArtStage>
  )
}

function SignalTipSwap(props: StageProps): JSX.Element {
  const swapElements: HTMLSpanElement[] = []
  let timeline: gsap.core.Timeline | undefined

  createEffect(() => {
    const working = props.state === 'work'
    timeline?.kill()
    timeline = undefined
    if (swapElements.length === 0) return
    gsap.set(swapElements, {opacity: 0})
    gsap.set(swapElements[0] ?? swapElements, {opacity: 1})
    if (!working || prefersReducedMotion()) return
    timeline = cycleLayers(swapElements, 0.36)
  })
  onCleanup(() => timeline?.kill())

  return (
    <ArtStage state={props.state}>
      <span style={layerStyle(props.sprites.stick)} />
      <span style={layerStyle(props.sprites.tip)} ref={(element) => swapElements.push(element)} />
      <span style={layerStyle(props.sprites.hollow)} ref={(element) => swapElements.push(element)} />
    </ArtStage>
  )
}

function DoubleBall(props: StageProps): JSX.Element {
  let upperElement: HTMLSpanElement | undefined
  let timeline: gsap.core.Timeline | undefined

  createEffect(() => {
    const working = props.state === 'work'
    const element = upperElement
    timeline?.kill()
    timeline = undefined
    if (element === undefined) return
    gsap.set(element, {opacity: 1})
    if (!working || prefersReducedMotion()) return
    timeline = gsap.timeline()
    timeline.to(element, {opacity: 0.2, duration: 0.34, ease: 'steps(1)', yoyo: true, repeat: -1}, 0)
  })
  onCleanup(() => timeline?.kill())

  return (
    <ArtStage state={props.state}>
      <span style={layerStyle(robotLayers.antenna)} />
      <span style={layerStyle(props.sprites.upperBall)} ref={(element) => (upperElement = element)} />
    </ArtStage>
  )
}

const variations: {name: string; note: string; stage: (props: StageProps) => JSX.Element}[] = [
  {name: 'LED tip blink', note: 'tip split from the stick', stage: LedTipBlink},
  {name: 'Tip colour cycle', note: 'recoloured tip pixels', stage: TipColorCycle},
  {name: 'Glow tip', note: 'tip scaled up behind', stage: GlowTip},
  {name: 'Charging tip', note: 'fills bottom to top', stage: ChargingTip},
  {name: 'Signal tip swap', note: 'ball to hollow ring', stage: SignalTipSwap},
  {name: 'Double ball', note: 'tip redrawn higher', stage: DoubleBall},
]

const pageStyle: JSX.CSSProperties = {
  display: 'flex',
  'flex-direction': 'column',
  gap: '1.5rem',
  padding: '1.5rem',
  color: 'inherit',
  'font-family': 'system-ui, sans-serif',
}

const toggleStyle: JSX.CSSProperties = {
  'min-height': '44px',
  padding: '0.5rem 0.875rem',
  border: `1px solid ${chromeBorderColor}`,
  'border-radius': '0.375rem',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
}

const gridStyle: JSX.CSSProperties = {
  display: 'grid',
  'grid-template-columns': 'repeat(3, minmax(0, 1fr))',
  gap: '1rem',
}

const cellStyle: JSX.CSSProperties = {
  display: 'flex',
  'flex-direction': 'column',
  'align-items': 'center',
  gap: '0.5rem',
  'padding-block': '1.25rem',
  'padding-inline': '0.5rem',
  border: `1px solid ${chromeBorderColor}`,
  'border-radius': '0.5rem',
}

const labelStyle: JSX.CSSProperties = {'font-size': '0.8125rem', 'text-align': 'center'}

const noteStyle: JSX.CSSProperties = {'font-size': '0.6875rem', 'text-align': 'center', opacity: '0.7'}

function Playground(): JSX.Element {
  const [working, setWorking] = createSignal(true)
  const [sprites, setSprites] = createSignal<AntennaSprites>()
  const state = (): RigState => (working() ? 'work' : 'closed')

  onMount(() => {
    void antennaSprites().then(setSprites)
  })

  return (
    <div style={pageStyle}>
      <div style={{display: 'flex', 'align-items': 'center', gap: '0.75rem'}}>
        <button
          type="button"
          aria-pressed={working()}
          onClick={() => setWorking((current) => !current)}
          style={toggleStyle}
        >
          {working() ? 'working' : 'idle'}
        </button>
        <span style={noteStyle}>tip sprites are derived at runtime from the existing antenna png, no new assets</span>
      </div>
      <Show when={sprites()} fallback={<span style={noteStyle}>deriving antenna sprites…</span>}>
        {(ready) => (
          <div style={gridStyle}>
            <For each={variations}>
              {(variation) => (
                <div style={cellStyle}>
                  <Dynamic component={variation.stage} state={state()} sprites={ready()} />
                  <span style={labelStyle}>{variation.name}</span>
                  <span style={noteStyle}>{variation.note}</span>
                </div>
              )}
            </For>
          </div>
        )}
      </Show>
    </div>
  )
}

export const DerivedTips: Story = {
  render: () => <Playground />,
}
