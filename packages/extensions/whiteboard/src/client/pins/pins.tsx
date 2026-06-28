import {For, Show, createMemo, createSignal, type JSX} from 'solid-js'
import {z} from 'zod'
import {useAll, useDb} from 'jazz-tools/solid'
import {app} from '../../shared/schema.js'
import {DragPrompt} from './drag-prompt.js'

export type PinsLayerProps = {
  room: string
  onOpen: (cid: string) => void
}

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
const ANCHOR_TAG =
  'absolute font-pw-mono text-[0.625rem] text-pw-text-2 bg-pw-panel border border-pw-line rounded-pw-sm px-1 py-px pointer-events-none whitespace-nowrap'

const DRAG_THRESHOLD = 4
const AnchorLine = z.object({source: z.object({line: z.number().nullable().optional()})})
const basename = (path: string): string => path.split('/').pop() ?? path
const authorLabel = (kind: string | undefined): string =>
  kind === 'ai' ? 'AI' : kind === 'human' ? 'Human' : 'Unknown'

type Drag = {cid: string; x: number; y: number}
type Prompt = {cid: string; x: number; y: number; origin: {x: number; y: number}}

export function PinsLayer(props: PinsLayerProps): JSX.Element {
  const db = useDb()
  const pins = useAll(() => ({query: app.pins.where({room: props.room})}))
  const comments = useAll(() => ({query: app.comments.where({sessionId: props.room})}))
  const byCid = createMemo(() => new Map((comments.data ?? []).map((comment) => [comment.cid, comment])))

  const [drag, setDrag] = createSignal<Drag | null>(null)
  const [prompt, setPrompt] = createSignal<Prompt | null>(null)

  const pinRow = (cid: string) => (pins.data ?? []).find((pin) => pin.cid === cid)
  const commentRow = (cid: string) => byCid().get(cid)

  const anchorLabel = (cid: string): string | null => {
    const comment = commentRow(cid)
    if (!comment?.anchorFile) return null
    const parsed = AnchorLine.safeParse(comment.anchor)
    const line = parsed.success ? parsed.data.source.line : null
    return line == null ? basename(comment.anchorFile) : `${basename(comment.anchorFile)}:${line}`
  }

  const movePin = (
    cid: string,
    patch: {x?: number; y?: number; pinState?: 'locked' | 'offset'; anchorX?: number; anchorY?: number},
  ): void => {
    const row = pinRow(cid)
    if (row) db().update(app.pins, row.id, patch)
  }

  const disconnect = (entry: Prompt): void => {
    const comment = commentRow(entry.cid)
    if (comment)
      db().update(app.comments, comment.id, {
        kind: 'floating',
        anchor: undefined,
        anchorFile: undefined,
        anchorComponent: undefined,
        anchorHash: undefined,
      })
    movePin(entry.cid, {x: entry.x, y: entry.y, pinState: 'offset'})
    setPrompt(null)
  }

  const keep = (entry: Prompt): void => {
    movePin(entry.cid, {x: entry.x, y: entry.y, pinState: 'offset', anchorX: entry.origin.x, anchorY: entry.origin.y})
    setPrompt(null)
  }

  const posOf = (cid: string, x: number, y: number): {x: number; y: number} => {
    const dragged = drag()
    return dragged && dragged.cid === cid ? {x: dragged.x, y: dragged.y} : {x, y}
  }

  return (
    <>
      <For each={pins.data ?? []}>
        {(pin) => {
          const status = (): CommentStatus => {
            const value = commentRow(pin.cid)?.status
            return isStatus(value) ? value : 'open'
          }
          const pos = (): {x: number; y: number} => posOf(pin.cid, pin.x, pin.y)
          let start: {px: number; py: number; ox: number; oy: number} | null = null
          return (
            <>
              <Show when={pin.pinState === 'offset' && pin.anchorX != null && pin.anchorY != null}>
                <svg class="size-full pointer-events-none inset-0 absolute">
                  <line
                    x1={pin.anchorX ?? undefined}
                    y1={pin.anchorY ?? undefined}
                    x2={pos().x}
                    y2={pos().y}
                    stroke="#adb5bd"
                    stroke-width="1"
                    stroke-dasharray="3 3"
                  />
                </svg>
              </Show>
              <button
                type="button"
                aria-label={`${authorLabel(commentRow(pin.cid)?.authorKind)} comment, ${status()}`}
                class={`${PIN}  ${STATUS_FILL[status()]}`}
                style={{left: `${pos().x}px`, top: `${pos().y}px`, transform: 'translate(-50%, -50%)'}}
                onPointerDown={(event) => {
                  event.preventDefault()
                  start = {px: event.clientX, py: event.clientY, ox: pin.x, oy: pin.y}
                  event.currentTarget.setPointerCapture(event.pointerId)
                }}
                onPointerMove={(event) => {
                  if (!start) return
                  setDrag({
                    cid: pin.cid,
                    x: start.ox + (event.clientX - start.px),
                    y: start.oy + (event.clientY - start.py),
                  })
                }}
                onPointerUp={() => {
                  const began = start
                  const dragged = drag()
                  start = null
                  setDrag(null)
                  if (!began) return
                  const moved =
                    dragged !== null &&
                    dragged.cid === pin.cid &&
                    (Math.abs(dragged.x - began.ox) > DRAG_THRESHOLD || Math.abs(dragged.y - began.oy) > DRAG_THRESHOLD)
                  if (!dragged || !moved) return props.onOpen(pin.cid)
                  if (commentRow(pin.cid)?.kind === 'source-linked')
                    return void setPrompt({
                      cid: pin.cid,
                      x: dragged.x,
                      y: dragged.y,
                      origin: {x: began.ox, y: began.oy},
                    })
                  movePin(pin.cid, {x: dragged.x, y: dragged.y})
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') props.onOpen(pin.cid)
                  if (event.key === 'Escape') event.currentTarget.blur()
                }}
              />
              <Show when={anchorLabel(pin.cid)}>
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
        {(entry) => (
          <DragPrompt
            x={entry().x}
            y={entry().y}
            onDisconnect={() => disconnect(entry())}
            onKeep={() => keep(entry())}
            onCancel={() => setPrompt(null)}
          />
        )}
      </Show>
    </>
  )
}
