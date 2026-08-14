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

const variations: {name: string; effect: () => JSX.Element}[] = [
  {name: 'Comic thought cloud', effect: ThoughtCloud},
  {name: 'Floating pixel bubbles', effect: PixelBubbles},
  {name: 'Radio signal rings', effect: SignalRings},
  {name: 'Speech bubble typing', effect: TypingBubble},
  {name: 'Steam puffs', effect: SteamPuffs},
  {name: 'Electric spark', effect: ElectricSpark},
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
