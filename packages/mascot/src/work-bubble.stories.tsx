import {createEffect, createSignal, onCleanup, onMount, For, Show, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import gsap from 'gsap'
import {createFabRobotRig, robotLayers, type FabRobotRig, type RigState} from './rig.js'

const meta: Meta = {title: 'mascot/WorkBubblePlayground'}
export default meta
type Story = StoryObj

const STAGE_SIZE_PX = 44

const CELL_HEADROOM_PX = 96

const accentColor = '#e0218a'

const bubbleInkColor = '#2f3142'

const paperColor = '#f7f4ef'

const steamColor = 'rgba(148, 158, 178, 0.55)'

const sparkColor = '#ffd23f'

const ellipsisIndexes = [0, 1, 2]

const pixelIndexes = [0, 1, 2, 3, 4, 5]

const ringIndexes = [0, 1, 2]

const puffIndexes = [0, 1, 2, 3]

const sparkIndexes = [0, 1, 2, 3, 4]

const binaryIndexes = [0, 1, 2, 3, 4]

const tickIndexes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

const barIndexes = [0, 1, 2, 3]

const fountainSeeds = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

const noteGlyphs = ['♪', '♫', '♩']

const matrixGlyphs = ['0', '1', '7', '4', '9', '2']

const matrixColor = '#4ade80'

const heartCells: [number, number][] = [
  [1, 0],
  [2, 0],
  [4, 0],
  [5, 0],
  [0, 1],
  [1, 1],
  [2, 1],
  [3, 1],
  [4, 1],
  [5, 1],
  [6, 1],
  [0, 2],
  [1, 2],
  [2, 2],
  [3, 2],
  [4, 2],
  [5, 2],
  [6, 2],
  [1, 3],
  [2, 3],
  [3, 3],
  [4, 3],
  [5, 3],
  [2, 4],
  [3, 4],
  [4, 4],
  [3, 5],
]

const SPARK_CANVAS_WIDTH = 120

const SPARK_CANVAS_HEIGHT = 104

const SPARK_ORIGIN_X = 60

const SPARK_ORIGIN_Y = 96

const SPARK_DURATION_MS = 520

const SPARK_RADIUS_PX = 26

const SPARK_SIZE_PX = 10

const BURST_INTERVAL_MS = 620

const burstAngles = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((index) => (index / 10) * Math.PI * 2)

const FOUNTAIN_EMIT_MS = 60

const FOUNTAIN_LIFE_MS = 1200

const FOUNTAIN_GRAVITY = 95

const FOUNTAIN_CONE_RADIANS = 0.9

const FOUNTAIN_MIN_SPEED = 46

const FOUNTAIN_SPEED_SPREAD = 30

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

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
    'will-change': 'transform',
  }
}

function RigStage(props: {state: RigState}): JSX.Element {
  let headElement: HTMLSpanElement | undefined
  let eyesElement: HTMLSpanElement | undefined
  let antennaElement: HTMLSpanElement | undefined
  let rig: FabRobotRig | undefined

  onMount(() => {
    if (!headElement || !eyesElement || !antennaElement) return
    rig = createFabRobotRig({head: headElement, eyes: eyesElement, antenna: antennaElement})
    createEffect(() => {
      rig?.apply(props.state)
    })
  })
  onCleanup(() => rig?.destroy())

  return (
    <span style={stageStyle} aria-hidden="true">
      <span style={layerStyle(robotLayers.head)} ref={(element) => (headElement = element)} />
      <span style={layerStyle(robotLayers.antenna)} ref={(element) => (antennaElement = element)} />
      <span style={layerStyle(robotLayers.eyes)} ref={(element) => (eyesElement = element)} />
    </span>
  )
}

const anchorStyle: JSX.CSSProperties = {
  position: 'absolute',
  left: '22px',
  top: '4px',
  width: '0',
  height: '0',
  'pointer-events': 'none',
}

function trailDotStyle(size: number, left: number, top: number): JSX.CSSProperties {
  return {
    position: 'absolute',
    left: `${left}px`,
    top: `${top}px`,
    width: `${size}px`,
    height: `${size}px`,
    'border-radius': '50%',
    background: paperColor,
    border: `1px solid ${bubbleInkColor}`,
    opacity: '1',
  }
}

function ThoughtCloud(): JSX.Element {
  const dotElements: HTMLDivElement[] = []
  let cloudElement: HTMLDivElement | undefined
  let timeline: gsap.core.Timeline | undefined

  onMount(() => {
    if (prefersReducedMotion()) return
    timeline = gsap.timeline()
    timeline.fromTo(
      dotElements,
      {opacity: 0.2},
      {opacity: 1, duration: 0.34, stagger: 0.2, ease: 'power1.inOut', yoyo: true, repeat: -1},
      0,
    )
    if (cloudElement) {
      timeline.to(cloudElement, {y: -2.5, duration: 1.5, ease: 'sine.inOut', yoyo: true, repeat: -1}, 0)
    }
  })
  onCleanup(() => timeline?.kill())

  return (
    <div style={anchorStyle}>
      <div style={trailDotStyle(4, -1, -9)} />
      <div style={trailDotStyle(6, 3, -21)} />
      <div
        ref={(element) => (cloudElement = element)}
        style={{
          position: 'absolute',
          left: '6px',
          top: '-52px',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          gap: '4px',
          width: '38px',
          height: '24px',
          'border-radius': '12px',
          background: paperColor,
          border: `1px solid ${bubbleInkColor}`,
        }}
      >
        <For each={ellipsisIndexes}>
          {() => (
            <div
              ref={(element) => dotElements.push(element)}
              style={{width: '4px', height: '4px', 'border-radius': '50%', background: bubbleInkColor, opacity: '1'}}
            />
          )}
        </For>
      </div>
    </div>
  )
}

function PixelBubbles(): JSX.Element {
  const squareElements: HTMLDivElement[] = []
  let timeline: gsap.core.Timeline | undefined

  onMount(() => {
    if (prefersReducedMotion()) {
      gsap.set(squareElements, {y: (index: number) => -index * 9, opacity: (index: number) => 1 - index * 0.14})
      return
    }
    timeline = gsap.timeline()
    timeline.fromTo(
      squareElements,
      {y: 0, x: 0, opacity: 0},
      {
        y: -56,
        x: (index: number) => (index % 2 === 0 ? 7 : -7),
        opacity: 0,
        duration: 2.1,
        ease: 'none',
        stagger: {each: 0.35, repeat: -1},
        keyframes: {opacity: [0, 1, 1, 0], easeEach: 'none'},
      },
      0,
    )
  })
  onCleanup(() => timeline?.kill())

  return (
    <div style={anchorStyle}>
      <For each={pixelIndexes}>
        {(index) => (
          <div
            ref={(element) => squareElements.push(element)}
            style={{
              position: 'absolute',
              left: `${index % 2 === 0 ? 0 : -4}px`,
              top: '-8px',
              width: `${index % 3 === 0 ? 5 : 3}px`,
              height: `${index % 3 === 0 ? 5 : 3}px`,
              background: index % 2 === 0 ? accentColor : bubbleInkColor,
              opacity: '1',
            }}
          />
        )}
      </For>
    </div>
  )
}

function SignalRings(): JSX.Element {
  const ringElements: HTMLDivElement[] = []
  let timeline: gsap.core.Timeline | undefined

  onMount(() => {
    if (prefersReducedMotion()) return
    timeline = gsap.timeline()
    timeline.fromTo(
      ringElements,
      {scale: 0.25, opacity: 0.95},
      {
        scale: 2.8,
        opacity: 0,
        duration: 1.6,
        ease: 'power1.out',
        stagger: {each: 0.5, repeat: -1},
      },
      0,
    )
  })
  onCleanup(() => timeline?.kill())

  return (
    <div style={anchorStyle}>
      <For each={ringIndexes}>
        {(index) => (
          <div
            ref={(element) => ringElements.push(element)}
            style={{
              position: 'absolute',
              left: '-11px',
              top: '-17px',
              width: '22px',
              height: '22px',
              'border-radius': '50%',
              border: `2px solid ${accentColor}`,
              opacity: `${0.8 - index * 0.25}`,
              transform: `scale(${0.6 + index * 0.7})`,
            }}
          />
        )}
      </For>
    </div>
  )
}

function TypingBubble(): JSX.Element {
  const dotElements: HTMLDivElement[] = []
  let timeline: gsap.core.Timeline | undefined

  onMount(() => {
    if (prefersReducedMotion()) return
    timeline = gsap.timeline()
    timeline.fromTo(
      dotElements,
      {opacity: 0.18},
      {opacity: 1, duration: 0.26, stagger: 0.16, ease: 'steps(1)', yoyo: true, repeat: -1},
      0,
    )
  })
  onCleanup(() => timeline?.kill())

  return (
    <div style={anchorStyle}>
      <div
        style={{
          position: 'absolute',
          left: '2px',
          top: '-40px',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          gap: '4px',
          width: '40px',
          height: '22px',
          background: paperColor,
          border: `2px solid ${bubbleInkColor}`,
          'border-radius': '2px',
        }}
      >
        <For each={ellipsisIndexes}>
          {() => (
            <div
              ref={(element) => dotElements.push(element)}
              style={{width: '4px', height: '4px', background: bubbleInkColor, opacity: '1'}}
            />
          )}
        </For>
      </div>
      <div
        style={{
          position: 'absolute',
          left: '5px',
          top: '-22px',
          width: '6px',
          height: '6px',
          background: paperColor,
          'border-right': `2px solid ${bubbleInkColor}`,
          'border-bottom': `2px solid ${bubbleInkColor}`,
          transform: 'rotate(45deg)',
        }}
      />
    </div>
  )
}

function SteamPuffs(): JSX.Element {
  const puffElements: HTMLDivElement[] = []
  let timeline: gsap.core.Timeline | undefined

  onMount(() => {
    if (prefersReducedMotion()) {
      gsap.set(puffElements, {
        y: (index: number) => -index * 12,
        scale: (index: number) => 0.7 + index * 0.25,
        opacity: (index: number) => 0.6 - index * 0.13,
      })
      return
    }
    timeline = gsap.timeline()
    timeline.fromTo(
      puffElements,
      {y: 0, x: 0, scale: 0.45, opacity: 0},
      {
        y: -52,
        x: (index: number) => (index % 2 === 0 ? 10 : -8),
        scale: 1.7,
        opacity: 0,
        duration: 2.4,
        ease: 'sine.out',
        stagger: {each: 0.6, repeat: -1},
        keyframes: {opacity: [0, 0.7, 0.5, 0], easeEach: 'none'},
      },
      0,
    )
  })
  onCleanup(() => timeline?.kill())

  return (
    <div style={anchorStyle}>
      <For each={puffIndexes}>
        {(index) => (
          <div
            ref={(element) => puffElements.push(element)}
            style={{
              position: 'absolute',
              left: '-6px',
              top: '-10px',
              width: '13px',
              height: '13px',
              'border-radius': '50%',
              background: steamColor,
              filter: 'blur(2px)',
              opacity: `${0.55 - index * 0.12}`,
            }}
          />
        )}
      </For>
    </div>
  )
}

function ElectricSpark(): JSX.Element {
  const segmentElements: HTMLDivElement[] = []
  let glowElement: HTMLDivElement | undefined
  let timeline: gsap.core.Timeline | undefined

  onMount(() => {
    if (prefersReducedMotion()) return
    timeline = gsap.timeline()
    timeline.fromTo(
      segmentElements,
      {opacity: 0.15},
      {opacity: 1, duration: 0.08, stagger: {each: 0.06, repeat: -1}, ease: 'steps(1)', yoyo: true, repeat: -1},
      0,
    )
    if (glowElement) {
      timeline.fromTo(
        glowElement,
        {scale: 0.7, opacity: 0.2},
        {scale: 1.5, opacity: 0.75, duration: 0.42, ease: 'sine.inOut', yoyo: true, repeat: -1},
        0,
      )
    }
  })
  onCleanup(() => timeline?.kill())

  return (
    <div style={anchorStyle}>
      <div
        ref={(element) => (glowElement = element)}
        style={{
          position: 'absolute',
          left: '-7px',
          top: '-9px',
          width: '14px',
          height: '14px',
          'border-radius': '50%',
          background: sparkColor,
          filter: 'blur(3px)',
          opacity: '0.5',
        }}
      />
      <For each={sparkIndexes}>
        {(index) => (
          <div
            ref={(element) => segmentElements.push(element)}
            style={{
              position: 'absolute',
              left: `${index % 2 === 0 ? -4 : 2}px`,
              top: `${-6 - index * 6}px`,
              width: '4px',
              height: '4px',
              background: sparkColor,
              opacity: '1',
            }}
          />
        )}
      </For>
    </div>
  )
}

const easeOutCubic = (progress: number) => 1 - (1 - progress) ** 3

function prepareCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | undefined {
  const context = canvas.getContext('2d')
  if (context === null) return undefined
  const ratio = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1
  canvas.width = SPARK_CANVAS_WIDTH * ratio
  canvas.height = SPARK_CANVAS_HEIGHT * ratio
  context.scale(ratio, ratio)
  return context
}

function runFrameLoop(step: (now: number) => void): () => void {
  let handle = 0
  const frame = (now: number) => {
    step(now)
    handle = requestAnimationFrame(frame)
  }
  handle = requestAnimationFrame(frame)
  return () => cancelAnimationFrame(handle)
}

const sparkCanvasStyle: JSX.CSSProperties = {
  position: 'absolute',
  left: `${-SPARK_ORIGIN_X}px`,
  top: `${-SPARK_ORIGIN_Y}px`,
  width: `${SPARK_CANVAS_WIDTH}px`,
  height: `${SPARK_CANVAS_HEIGHT}px`,
  'pointer-events': 'none',
}

function RadialSparkBurst(): JSX.Element {
  let canvasElement: HTMLCanvasElement | undefined
  let cancel: (() => void) | undefined

  onMount(() => {
    if (!canvasElement) return
    const context = prepareCanvas(canvasElement)
    if (context === undefined) return
    let sparks: {angle: number; birth: number}[] = []
    const draw = (now: number) => {
      context.clearRect(0, 0, SPARK_CANVAS_WIDTH, SPARK_CANVAS_HEIGHT)
      context.lineWidth = 2
      sparks.forEach((spark, index) => {
        const eased = easeOutCubic(Math.min(1, (now - spark.birth) / SPARK_DURATION_MS))
        const distance = eased * SPARK_RADIUS_PX
        const length = SPARK_SIZE_PX * (1 - eased)
        context.strokeStyle = index % 2 === 0 ? accentColor : sparkColor
        context.globalAlpha = 1 - eased
        context.beginPath()
        context.moveTo(
          SPARK_ORIGIN_X + Math.cos(spark.angle) * distance,
          SPARK_ORIGIN_Y + Math.sin(spark.angle) * distance,
        )
        context.lineTo(
          SPARK_ORIGIN_X + Math.cos(spark.angle) * (distance + length),
          SPARK_ORIGIN_Y + Math.sin(spark.angle) * (distance + length),
        )
        context.stroke()
      })
      context.globalAlpha = 1
    }
    if (prefersReducedMotion()) {
      sparks = burstAngles.map((angle) => ({angle, birth: 0}))
      draw(SPARK_DURATION_MS * 0.45)
      return
    }
    let lastBurst = -BURST_INTERVAL_MS
    cancel = runFrameLoop((now) => {
      if (now - lastBurst >= BURST_INTERVAL_MS) {
        sparks = [...sparks, ...burstAngles.map((angle) => ({angle, birth: now}))]
        lastBurst = now
      }
      sparks = sparks.filter((spark) => now - spark.birth < SPARK_DURATION_MS)
      draw(now)
    })
  })
  onCleanup(() => cancel?.())

  return <canvas ref={(element) => (canvasElement = element)} style={sparkCanvasStyle} />
}

function makeFountainSpark(birth: number): {velocityX: number; velocityY: number; birth: number} {
  const angle = -Math.PI / 2 + (Math.random() - 0.5) * FOUNTAIN_CONE_RADIANS
  const speed = FOUNTAIN_MIN_SPEED + Math.random() * FOUNTAIN_SPEED_SPREAD
  return {velocityX: Math.cos(angle) * speed, velocityY: Math.sin(angle) * speed, birth}
}

function SparkFountain(): JSX.Element {
  let canvasElement: HTMLCanvasElement | undefined
  let cancel: (() => void) | undefined

  onMount(() => {
    if (!canvasElement) return
    const context = prepareCanvas(canvasElement)
    if (context === undefined) return
    let sparks: {velocityX: number; velocityY: number; birth: number}[] = []
    const draw = (now: number) => {
      context.clearRect(0, 0, SPARK_CANVAS_WIDTH, SPARK_CANVAS_HEIGHT)
      context.lineWidth = 2
      sparks.forEach((spark, index) => {
        const age = (now - spark.birth) / 1000
        const progress = Math.min(1, (now - spark.birth) / FOUNTAIN_LIFE_MS)
        const x = SPARK_ORIGIN_X + spark.velocityX * age
        const y = SPARK_ORIGIN_Y + spark.velocityY * age + FOUNTAIN_GRAVITY * age * age * 0.5
        const heading = Math.atan2(spark.velocityY + FOUNTAIN_GRAVITY * age, spark.velocityX)
        const length = SPARK_SIZE_PX * 0.6 * (1 - progress)
        context.strokeStyle = index % 3 === 0 ? sparkColor : accentColor
        context.globalAlpha = 1 - progress
        context.beginPath()
        context.moveTo(x, y)
        context.lineTo(x + Math.cos(heading) * length, y + Math.sin(heading) * length)
        context.stroke()
      })
      context.globalAlpha = 1
    }
    if (prefersReducedMotion()) {
      sparks = fountainSeeds.map((index) => makeFountainSpark(-index * FOUNTAIN_EMIT_MS * 2))
      draw(0)
      return
    }
    let lastEmit = 0
    cancel = runFrameLoop((now) => {
      if (now - lastEmit >= FOUNTAIN_EMIT_MS) {
        sparks = [...sparks, makeFountainSpark(now), makeFountainSpark(now)]
        lastEmit = now
      }
      sparks = sparks.filter((spark) => now - spark.birth < FOUNTAIN_LIFE_MS)
      draw(now)
    })
  })
  onCleanup(() => cancel?.())

  return <canvas ref={(element) => (canvasElement = element)} style={sparkCanvasStyle} />
}

function OrbitingSatellite(): JSX.Element {
  let orbitElement: HTMLDivElement | undefined
  let timeline: gsap.core.Timeline | undefined

  onMount(() => {
    if (!orbitElement) return
    if (prefersReducedMotion()) {
      gsap.set(orbitElement, {rotation: -40})
      return
    }
    timeline = gsap.timeline()
    timeline.to(orbitElement, {rotation: 360, duration: 2.6, ease: 'none', repeat: -1}, 0)
  })
  onCleanup(() => timeline?.kill())

  return (
    <div style={anchorStyle}>
      <div
        style={{
          position: 'absolute',
          left: '-17px',
          top: '-35px',
          width: '34px',
          height: '34px',
          'border-radius': '50%',
          border: `1px dashed ${chromeBorderColor}`,
        }}
      />
      <div ref={(element) => (orbitElement = element)} style={{position: 'absolute', left: '0', top: '-18px'}}>
        <div
          style={{
            position: 'absolute',
            left: '-2px',
            top: '-19px',
            width: '5px',
            height: '5px',
            background: accentColor,
          }}
        />
      </div>
    </div>
  )
}

function LedBeacon(): JSX.Element {
  let ledElement: HTMLDivElement | undefined
  let coneElement: HTMLDivElement | undefined
  let timeline: gsap.core.Timeline | undefined

  onMount(() => {
    if (prefersReducedMotion()) return
    timeline = gsap.timeline()
    if (ledElement) {
      timeline.to(ledElement, {opacity: 0.25, duration: 0.5, ease: 'steps(1)', yoyo: true, repeat: -1}, 0)
    }
    if (coneElement) {
      timeline.to(coneElement, {opacity: 0.08, duration: 0.5, ease: 'sine.inOut', yoyo: true, repeat: -1}, 0)
    }
  })
  onCleanup(() => timeline?.kill())

  return (
    <div style={anchorStyle}>
      <div
        ref={(element) => (coneElement = element)}
        style={{
          position: 'absolute',
          left: '-12px',
          top: '-35px',
          width: '0',
          height: '0',
          'border-left': '12px solid transparent',
          'border-right': '12px solid transparent',
          'border-bottom': `27px solid ${accentColor}`,
          opacity: '0.18',
        }}
      />
      <div
        ref={(element) => (ledElement = element)}
        style={{
          position: 'absolute',
          left: '-3px',
          top: '-9px',
          width: '6px',
          height: '6px',
          background: accentColor,
          opacity: '1',
        }}
      />
    </div>
  )
}

function RisingBinary(): JSX.Element {
  const glyphElements: HTMLSpanElement[] = []
  let timeline: gsap.core.Timeline | undefined

  onMount(() => {
    if (prefersReducedMotion()) {
      gsap.set(glyphElements, {y: (index: number) => -index * 11, opacity: (index: number) => 1 - index * 0.16})
      return
    }
    timeline = gsap.timeline()
    timeline.fromTo(
      glyphElements,
      {y: 0, opacity: 0},
      {
        y: -54,
        duration: 2.2,
        ease: 'none',
        stagger: {each: 0.42, repeat: -1},
        keyframes: {opacity: [0, 1, 1, 0], easeEach: 'none'},
      },
      0,
    )
  })
  onCleanup(() => timeline?.kill())

  return (
    <div style={anchorStyle}>
      <For each={binaryIndexes}>
        {(index) => (
          <span
            ref={(element) => glyphElements.push(element)}
            style={{
              position: 'absolute',
              left: `${index % 2 === 0 ? -1 : -7}px`,
              top: '-12px',
              'font-family': 'ui-monospace, monospace',
              'font-size': '9px',
              'line-height': '1',
              color: accentColor,
            }}
          >
            {index % 2 === 0 ? '1' : '0'}
          </span>
        )}
      </For>
    </div>
  )
}

function ProgressTickRing(): JSX.Element {
  const tickElements: HTMLDivElement[] = []
  let timeline: gsap.core.Timeline | undefined

  onMount(() => {
    if (prefersReducedMotion()) {
      gsap.set(tickElements, {opacity: (index: number) => (index < 7 ? 1 : 0.2)})
      return
    }
    timeline = gsap.timeline()
    timeline.fromTo(
      tickElements,
      {opacity: 0.18},
      {opacity: 1, duration: 0.18, ease: 'steps(1)', stagger: {each: 0.12, repeat: -1}, yoyo: true, repeat: -1},
      0,
    )
  })
  onCleanup(() => timeline?.kill())

  return (
    <div style={anchorStyle}>
      <For each={tickIndexes}>
        {(index) => (
          <div
            ref={(element) => tickElements.push(element)}
            style={{
              position: 'absolute',
              left: `${Math.cos((index / 12) * Math.PI * 2 - Math.PI / 2) * 16 - 1.5}px`,
              top: `${-19 + Math.sin((index / 12) * Math.PI * 2 - Math.PI / 2) * 16 - 1.5}px`,
              width: '3px',
              height: '3px',
              background: accentColor,
              opacity: '1',
            }}
          />
        )}
      </For>
    </div>
  )
}

function SignalBars(): JSX.Element {
  const barElements: HTMLDivElement[] = []
  let timeline: gsap.core.Timeline | undefined

  onMount(() => {
    if (prefersReducedMotion()) {
      gsap.set(barElements, {opacity: (index: number) => (index < 3 ? 1 : 0.22)})
      return
    }
    timeline = gsap.timeline()
    timeline.fromTo(
      barElements,
      {opacity: 0.2},
      {opacity: 1, duration: 0.22, ease: 'steps(1)', stagger: {each: 0.22, repeat: -1}, yoyo: true, repeat: -1},
      0,
    )
  })
  onCleanup(() => timeline?.kill())

  return (
    <div style={anchorStyle}>
      <For each={barIndexes}>
        {(index) => (
          <div
            ref={(element) => barElements.push(element)}
            style={{
              position: 'absolute',
              left: `${-12 + index * 6}px`,
              top: `${-11 - (index + 1) * 4}px`,
              width: '4px',
              height: `${(index + 1) * 4}px`,
              background: accentColor,
              opacity: '1',
            }}
          />
        )}
      </For>
    </div>
  )
}

function PixelHeart(): JSX.Element {
  let heartElement: HTMLDivElement | undefined
  let timeline: gsap.core.Timeline | undefined

  onMount(() => {
    if (!heartElement) return
    if (prefersReducedMotion()) return
    timeline = gsap.timeline()
    timeline.to(heartElement, {scale: 1.22, duration: 0.42, ease: 'sine.inOut', yoyo: true, repeat: -1}, 0)
  })
  onCleanup(() => timeline?.kill())

  return (
    <div style={anchorStyle}>
      <div ref={(element) => (heartElement = element)} style={{position: 'absolute', left: '-11px', top: '-32px'}}>
        <For each={heartCells}>
          {(cell) => (
            <div
              style={{
                position: 'absolute',
                left: `${cell[0] * 3}px`,
                top: `${cell[1] * 3}px`,
                width: '3px',
                height: '3px',
                background: accentColor,
              }}
            />
          )}
        </For>
      </div>
    </div>
  )
}

function MusicNotes(): JSX.Element {
  const noteElements: HTMLSpanElement[] = []
  let timeline: gsap.core.Timeline | undefined

  onMount(() => {
    if (prefersReducedMotion()) {
      gsap.set(noteElements, {y: (index: number) => -index * 15, opacity: (index: number) => 1 - index * 0.25})
      return
    }
    timeline = gsap.timeline()
    timeline.fromTo(
      noteElements,
      {y: 0, x: 0, rotation: -8, opacity: 0},
      {
        y: -52,
        x: (index: number) => (index % 2 === 0 ? 12 : -10),
        rotation: 10,
        duration: 2.6,
        ease: 'sine.out',
        stagger: {each: 0.75, repeat: -1},
        keyframes: {opacity: [0, 1, 1, 0], easeEach: 'none'},
      },
      0,
    )
  })
  onCleanup(() => timeline?.kill())

  return (
    <div style={anchorStyle}>
      <For each={noteGlyphs}>
        {(glyph) => (
          <span
            ref={(element) => noteElements.push(element)}
            style={{
              position: 'absolute',
              left: '-4px',
              top: '-14px',
              'font-size': '11px',
              'line-height': '1',
              color: accentColor,
            }}
          >
            {glyph}
          </span>
        )}
      </For>
    </div>
  )
}

function MatrixDrip(): JSX.Element {
  const glyphElements: HTMLSpanElement[] = []
  let timeline: gsap.core.Timeline | undefined

  onMount(() => {
    if (prefersReducedMotion()) {
      gsap.set(glyphElements, {y: (index: number) => -index * 9, opacity: (index: number) => 1 - index * 0.14})
      return
    }
    timeline = gsap.timeline()
    timeline.fromTo(
      glyphElements,
      {y: -58, opacity: 0},
      {
        y: -6,
        duration: 1.9,
        ease: 'none',
        stagger: {each: 0.32, repeat: -1},
        keyframes: {opacity: [0, 1, 0.8, 0], easeEach: 'none'},
      },
      0,
    )
  })
  onCleanup(() => timeline?.kill())

  return (
    <div style={anchorStyle}>
      <For each={matrixGlyphs}>
        {(glyph, index) => (
          <span
            ref={(element) => glyphElements.push(element)}
            style={{
              position: 'absolute',
              left: `${-12 + index() * 5}px`,
              top: '0px',
              'font-family': 'ui-monospace, monospace',
              'font-size': '8px',
              'line-height': '1',
              color: matrixColor,
            }}
          >
            {glyph}
          </span>
        )}
      </For>
    </div>
  )
}

const variations: {name: string; effect: () => JSX.Element}[] = [
  {name: 'Comic thought cloud', effect: ThoughtCloud},
  {name: 'Floating pixel bubbles', effect: PixelBubbles},
  {name: 'Radio signal rings', effect: SignalRings},
  {name: 'Speech bubble typing', effect: TypingBubble},
  {name: 'Steam puffs', effect: SteamPuffs},
  {name: 'Electric spark', effect: ElectricSpark},
  {name: 'Radial spark burst', effect: RadialSparkBurst},
  {name: 'Spark fountain', effect: SparkFountain},
  {name: 'Orbiting satellite', effect: OrbitingSatellite},
  {name: 'LED beacon cone', effect: LedBeacon},
  {name: 'Rising binary', effect: RisingBinary},
  {name: 'Progress tick ring', effect: ProgressTickRing},
  {name: 'Signal bars', effect: SignalBars},
  {name: 'Pixel heart pulse', effect: PixelHeart},
  {name: 'Music notes', effect: MusicNotes},
  {name: 'Matrix drip', effect: MatrixDrip},
]

const pageStyle: JSX.CSSProperties = {
  display: 'flex',
  'flex-direction': 'column',
  gap: '1.5rem',
  padding: '1.5rem',
  color: 'inherit',
  'font-family': 'system-ui, sans-serif',
}

const chromeBorderColor = 'rgba(128, 134, 156, 0.45)'

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
  gap: '0.75rem',
  'padding-block-start': `${CELL_HEADROOM_PX}px`,
  'padding-block-end': '0.75rem',
  'padding-inline': '0.5rem',
  border: `1px solid ${chromeBorderColor}`,
  'border-radius': '0.5rem',
}

const stageWrapStyle: JSX.CSSProperties = {
  position: 'relative',
  width: `${STAGE_SIZE_PX}px`,
  height: `${STAGE_SIZE_PX}px`,
}

const labelStyle: JSX.CSSProperties = {'font-size': '0.8125rem', 'text-align': 'center'}

function Playground(): JSX.Element {
  const [working, setWorking] = createSignal(true)
  const state = (): RigState => (working() ? 'work' : 'closed')

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
        <span style={labelStyle}>
          {working() ? 'bubbles run while working' : 'closed: eyes follow the cursor, no bubbles'}
        </span>
      </div>
      <div style={gridStyle}>
        <For each={variations}>
          {(variation) => (
            <div style={cellStyle}>
              <div style={stageWrapStyle}>
                <RigStage state={state()} />
                <Show when={working()}>
                  <Dynamic component={variation.effect} />
                </Show>
              </div>
              <span style={labelStyle}>{variation.name}</span>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}

export const Playground6Up: Story = {
  render: () => <Playground />,
}
