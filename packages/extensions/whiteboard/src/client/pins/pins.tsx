import {For, Show, createEffect, createSignal, type JSX} from 'solid-js'
import {z} from 'zod'
import {sceneToScreen, screenToScene} from '../../canvas/coords.js'
import {useComments, type Comment} from '../model/comments.js'
import {DragPrompt} from './drag-prompt.js'

type CommentStatus = 'open' | 'resolved' | 'drifted' | 'orphaned'

const STATUS_FILL: Record<CommentStatus, string> = {
  open: 'bg-pw-accent',
  resolved: 'bg-pw-success',
  drifted: 'bg-pw-warn',
  orphaned: 'bg-pw-dim',
}

const isStatus = (value: string | undefined): value is CommentStatus =>
  value !== undefined && Object.hasOwn(STATUS_FILL, value)

const PIN =
  'absolute size-6 rounded-[50%_50%_50%_0] border-2 border-white cursor-grab touch-none pointer-events-auto shadow-[0_1px_4px_rgba(0,0,0,0.3)] focus-ring'
const UNREAD_DOT =
  'absolute -top-1 -right-1 size-2.5 rounded-pw-pill bg-pw-accent [box-shadow:0_0_0_2px_var(--pw-panel)]'
const ANCHOR_TAG =
  'absolute font-pw-mono text-[0.625rem] text-pw-text-2 bg-pw-panel border border-pw-line rounded-pw-sm px-1 py-px pointer-events-none whitespace-nowrap'

// Drag threshold in scene units; at zoom 1 it matches the old screen-pixel behavior.
const DRAG_THRESHOLD = 4
const AnchorLine = z.object({source: z.object({line: z.number().nullable().optional()})})
const basename = (path: string): string => path.split('/').pop() ?? path
const authorLabel = (kind: string | undefined): string =>
  kind === 'ai' ? 'AI' : kind === 'human' ? 'Human' : 'Unknown'

// Pin positions are scene coordinates; `drag`/`prompt` carry the live scene position mid-drag.
type Drag = {cid: string; x: number; y: number}
type Prompt = {cid: string; x: number; y: number; origin: {x: number; y: number}}

export function PinsLayer(): JSX.Element {
  const model = useComments()
  const [drag, setDrag] = createSignal<Drag | null>(null)
  const [prompt, setPrompt] = createSignal<Prompt | null>(null)

  // A moved pin keeps its drag position through the async pin write; clear it only once the committed
  // scene coords catch up, so the pin never flashes back to its pre-drag spot (and a later remote move
  // isn't masked by a stale drag).
  createEffect(() => {
    const dropped = drag()
    if (!dropped) return
    const pin = model.pins().find((row) => row.cid === dropped.cid)
    if (pin && pin.x === dropped.x && pin.y === dropped.y) setDrag(null)
  })

  const anchorLabel = (comment: Comment | undefined): string | null => {
    if (!comment?.anchorFile) return null
    const parsed = AnchorLine.safeParse(comment.anchor)
    const line = parsed.success ? parsed.data.source.line : null
    return line == null ? basename(comment.anchorFile) : `${basename(comment.anchorFile)}:${line}`
  }

  const disconnect = (entry: Prompt): void => {
    model.detachAnchor(entry.cid)
    model.movePin(entry.cid, {x: entry.x, y: entry.y, pinState: 'offset'})
    setPrompt(null)
  }
  const keep = (entry: Prompt): void => {
    model.movePin(entry.cid, {
      x: entry.x,
      y: entry.y,
      pinState: 'offset',
      anchorX: entry.origin.x,
      anchorY: entry.origin.y,
    })
    setPrompt(null)
  }

  // The dragged scene position for a pin, or its committed scene position.
  const sceneOf = (cid: string, x: number, y: number): {x: number; y: number} => {
    const dragged = drag()
    return dragged && dragged.cid === cid ? {x: dragged.x, y: dragged.y} : {x, y}
  }

  return (
    <Show when={model.viewport()}>
      {(view) => {
        const screenOf = (cid: string, x: number, y: number): {x: number; y: number} => {
          const scene = sceneOf(cid, x, y)
          return sceneToScreen(view(), scene.x, scene.y)
        }
        return (
          <>
            <For each={model.pins()}>
              {(pin) => {
                const comment = (): Comment | undefined => model.rootOf(pin.cid)
                const status = (): CommentStatus => {
                  const value = comment()?.status
                  return isStatus(value) ? value : 'open'
                }
                const pos = (): {x: number; y: number} => screenOf(pin.cid, pin.x, pin.y)
                const anchorPos = (): {x: number; y: number} =>
                  sceneToScreen(view(), pin.anchorX ?? 0, pin.anchorY ?? 0)
                let start: {grabDX: number; grabDY: number; ox: number; oy: number} | null = null
                return (
                  <>
                    <Show when={pin.pinState === 'offset' && pin.anchorX != null && pin.anchorY != null}>
                      <svg class="absolute inset-0 size-full pointer-events-none">
                        <line
                          x1={anchorPos().x}
                          y1={anchorPos().y}
                          x2={pos().x}
                          y2={pos().y}
                          stroke="var(--pw-line-2)"
                          stroke-width="1"
                          stroke-dasharray="3 3"
                        />
                      </svg>
                    </Show>
                    <button
                      type="button"
                      ref={(element) => model.registerPin(pin.cid, element)}
                      aria-label={`${authorLabel(comment()?.authorKind)} comment, ${status()}${model.isUnread(pin.cid) ? ', unread' : ''}`}
                      class={`${PIN}  ${STATUS_FILL[status()]}`}
                      style={{left: `${pos().x}px`, top: `${pos().y}px`, transform: 'translate(-50%, -50%)'}}
                      onPointerDown={(event) => {
                        event.preventDefault()
                        const down = screenToScene(view(), event.clientX, event.clientY)
                        start = {grabDX: pin.x - down.x, grabDY: pin.y - down.y, ox: pin.x, oy: pin.y}
                        event.currentTarget.setPointerCapture(event.pointerId)
                      }}
                      onPointerMove={(event) => {
                        if (!start) return
                        model.closeThread()
                        const scene = screenToScene(view(), event.clientX, event.clientY)
                        setDrag({cid: pin.cid, x: scene.x + start.grabDX, y: scene.y + start.grabDY})
                      }}
                      onPointerUp={() => {
                        const began = start
                        const dragged = drag()
                        start = null
                        if (!began) return
                        const moved =
                          dragged !== null &&
                          dragged.cid === pin.cid &&
                          (Math.abs(dragged.x - began.ox) > DRAG_THRESHOLD ||
                            Math.abs(dragged.y - began.oy) > DRAG_THRESHOLD)
                        if (!dragged || !moved) {
                          setDrag(null)
                          return model.openThread(pin.cid)
                        }
                        if (comment()?.kind === 'source-linked') {
                          setDrag(null)
                          return void setPrompt({
                            cid: pin.cid,
                            x: dragged.x,
                            y: dragged.y,
                            origin: {x: began.ox, y: began.oy},
                          })
                        }
                        model.movePin(pin.cid, {x: dragged.x, y: dragged.y})
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') model.openThread(pin.cid)
                        if (event.key === 'Escape') event.currentTarget.blur()
                      }}
                    >
                      <Show when={model.isUnread(pin.cid)}>
                        <span class={UNREAD_DOT} aria-hidden="true" />
                      </Show>
                    </button>
                    <Show when={anchorLabel(comment())}>
                      {(label) => (
                        <span class={ANCHOR_TAG} style={{left: `${pos().x + 16}px`, top: `${pos().y - 8}px`}}>
                          {label()}
                        </span>
                      )}
                    </Show>
                  </>
                )
              }}
            </For>
            <Show when={prompt()}>
              {(entry) => {
                const at = (): {x: number; y: number} => sceneToScreen(view(), entry().x, entry().y)
                return (
                  <DragPrompt
                    x={at().x}
                    y={at().y}
                    onDisconnect={() => disconnect(entry())}
                    onKeep={() => keep(entry())}
                    onCancel={() => setPrompt(null)}
                  />
                )
              }}
            </Show>
          </>
        )
      }}
    </Show>
  )
}
