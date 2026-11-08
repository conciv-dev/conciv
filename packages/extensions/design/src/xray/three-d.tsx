import {For, Show, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {makeEventListener} from '@solid-primitives/event-listener'
import {Button} from '@conciv/ui-kit-system'
import type {Box} from '../shared/defs.js'
import type {createXrayData} from './data.js'
import type {createXrayState} from './state.js'
import type {createXrayView} from './view.js'

export function ThreeD(props: {
  xray: ReturnType<typeof createXrayState>
  data: ReturnType<typeof createXrayData>
  view: ReturnType<typeof createXrayView>
}): JSX.Element {
  const [drag, setDrag] = createStore<{from: {x: number; y: number} | null}>({from: null})
  makeEventListener(window, 'pointermove', (event) => {
    const from = drag.from
    if (from === null) return
    props.xray.orbit({tilt: (from.y - event.clientY) * ORBIT_RATE, turn: (event.clientX - from.x) * ORBIT_RATE})
    setDrag('from', {x: event.clientX, y: event.clientY})
  })
  makeEventListener(window, 'pointerup', () => setDrag('from', null))
  const size = (): {width: number; height: number} => ({
    width: props.view.target()?.width ?? 0,
    height: props.view.target()?.height ?? 0,
  })
  const fit = (): number => Math.min(1, (innerWidth * STAGE_SHARE) / Math.max(1, size().width))
  const focused = (): boolean => props.xray.state.plane !== null
  const stage = (): string =>
    focused()
      ? 'none'
      : `scale(${fit()}) rotateX(${props.xray.state.orbit.tilt}deg) rotateZ(${props.xray.state.orbit.turn}deg)`
  const image = (path: string): string => props.data.file(`${path}/${props.view.target()?.id ?? ''}`)
  const round = (): number => props.data.shownRound()?.round ?? 0
  return (
    <div
      role="group"
      aria-label="Design x-ray planes"
      class="pointer-events-auto inset-0 fixed overflow-auto"
      classList={{'cursor-grab': !focused()}}
      style={{perspective: focused() ? 'none' : `${size().width * PERSPECTIVE_SHARE}px`}}
      onPointerDown={(event) => {
        if (focused() || event.target !== event.currentTarget) return
        setDrag('from', {x: event.clientX, y: event.clientY})
      }}
    >
      <div
        class="start-1/2 top-1/2 absolute"
        style={{
          width: `${size().width}px`,
          height: `${size().height}px`,
          transform: focused() ? 'none' : `translate(-50%, -50%) ${stage()}`,
          'transform-style': 'preserve-3d',
          ...(focused() ? {position: 'relative', left: '0', top: '0'} : {}),
        }}
      >
        <For each={PLANES}>
          {(plane) => (
            <Show when={!focused() || props.xray.state.plane === plane.key}>
              <section
                aria-label={`${plane.label} plane`}
                class="border border-chat-line bg-chat-panel inset-0 absolute"
                style={{
                  transform: focused()
                    ? 'none'
                    : `translateZ(${depthOf({key: plane.key, gap: size().width * GAP_SHARE})}px)`,
                  'view-transition-name': `plane-${plane.key}`,
                }}
                onClick={() => props.xray.focusPlane(plane.key)}
              >
                <Show when={plane.key === 'dom'}>
                  <img
                    alt="live page"
                    class="size-full inset-0 absolute object-cover object-top"
                    src={props.data.file(`live/${props.view.target()?.id ?? ''}/${round()}`)}
                  />
                </Show>
                <Show when={plane.key === 'fom'}>
                  <img alt="design" class="size-full inset-0 absolute object-cover object-top" src={image('target')} />
                </Show>
                <For each={props.view.visible()}>
                  {(entry) => (
                    <For each={boxesOf({plane: plane.key, entry})}>
                      {(placed) => (
                        <div
                          aria-hidden="true"
                          class="outline-1 absolute"
                          classList={{'outline-dashed': plane.key === 'fom', 'outline-solid': plane.key !== 'fom'}}
                          style={{
                            ...position(placed.box),
                            'outline-color': `var(--xray-${entry.shown})`,
                            'view-transition-name': placed.name,
                          }}
                        >
                          <Show when={placed.label !== null}>
                            <span class="text-xs text-chat-text-2 font-chat-mono px-0.5 bg-chat-panel truncate start-0 top-0 absolute">
                              {placed.label}
                            </span>
                          </Show>
                        </div>
                      )}
                    </For>
                  )}
                </For>
                <Button
                  variant="panel"
                  size="sm"
                  class="start-2 top-2 absolute"
                  onClick={(event) => {
                    event.stopPropagation()
                    props.xray.focusPlane(plane.key)
                  }}
                >
                  {plane.label}
                </Button>
              </section>
            </Show>
          )}
        </For>
        <Show when={!focused()}>
          <For each={props.view.visible().filter((entry) => entry.rows.length > 0)}>
            {(entry) => (
              <For each={linesOf({entry, gap: size().width * GAP_SHARE})}>
                {(line) => (
                  <div
                    aria-hidden="true"
                    class="h-0.5 origin-left absolute"
                    style={{
                      left: `${line.x}px`,
                      top: `${line.y}px`,
                      width: `${line.length}px`,
                      background: `var(--xray-${entry.shown})`,
                      transform: `translateZ(${line.z}px) rotateZ(${line.turn}rad) rotateY(${line.lift}rad)`,
                    }}
                  />
                )}
              </For>
            )}
          </For>
        </Show>
      </div>
    </div>
  )
}

type Entry = ReturnType<ReturnType<typeof createXrayView>['visible']>[number]

type PlaneKey = 'src' | 'cssom' | 'dom' | 'fom'

const PLANES: {key: PlaneKey; label: string}[] = [
  {key: 'src', label: 'SRC'},
  {key: 'cssom', label: 'CSSOM'},
  {key: 'dom', label: 'DOM'},
  {key: 'fom', label: 'FOM'},
]

const PLANE_INDEX: Record<PlaneKey, number> = {src: 0, cssom: 1, dom: 2, fom: 3}

const STAGE_SHARE = 0.55

const PERSPECTIVE_SHARE = 2

const GAP_SHARE = 0.18

const ORBIT_RATE = 0.3

function boxesOf(input: {plane: PlaneKey; entry: Entry}): {box: Box; label: string | null; name: string}[] {
  const {plane, entry} = input
  if (plane === 'fom')
    return entry.node.fom.flatMap((pair) => (pair.box === null ? [] : [{box: pair.box, label: null, name: 'none'}]))
  const at = entry.node.src.at
  const label = plane === 'src' ? (at === null ? entry.node.src.element : `${at.file}:${at.line}`) : null
  return entry.node.dom.map((dom, index) => ({
    name: plane === 'dom' && index === 0 ? `box-${CSS.escape(entry.node.id)}` : 'none',
    box: dom.box,
    label: plane === 'cssom' ? (entry.node.cssom[0]?.display ?? null) : label,
  }))
}

function linesOf(input: {
  entry: Entry
  gap: number
}): {x: number; y: number; z: number; length: number; turn: number; lift: number}[] {
  const start = input.entry.node.dom[0]?.box
  if (start === undefined) return []
  const z = depthOf({key: 'dom', gap: input.gap})
  return input.entry.node.fom.flatMap((pair) => {
    if (pair.box === null) return []
    const from = centre(start)
    const to = centre(pair.box)
    const flat = Math.hypot(to.x - from.x, to.y - from.y)
    const depth = depthOf({key: 'fom', gap: input.gap}) - z
    return [
      {
        x: from.x,
        y: from.y,
        z,
        length: Math.hypot(flat, depth),
        turn: Math.atan2(to.y - from.y, to.x - from.x),
        lift: Math.atan2(-depth, flat),
      },
    ]
  })
}

function depthOf(input: {key: PlaneKey; gap: number}): number {
  return (PLANES.length - 1 - PLANE_INDEX[input.key]) * input.gap
}

function centre(box: Box): {x: number; y: number} {
  return {x: box.x + box.w / 2, y: box.y + box.h / 2}
}

function position(box: Box): JSX.CSSProperties {
  return {left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px`}
}
