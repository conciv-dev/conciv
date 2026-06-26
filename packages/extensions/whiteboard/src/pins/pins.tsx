import {For, Show, createMemo, createSignal, onCleanup, type JSX} from 'solid-js'
import {render} from 'solid-js/web'
import {z} from 'zod'
import {useLiveQuery} from '@tanstack/solid-db'
import type * as Y from 'yjs'
import {ORIGIN, PINS_KEY, type PinGeometry} from '../room.js'
import {getCommentsCollection} from '../comments-store.js'
import type {Comment} from '../schema.js'
import {DragPrompt} from './drag-prompt.js'

export type MountPinsOpts = {
  container: HTMLElement
  doc: Y.Doc
  onOpen?: (cid: string) => void
}

const STATUS_COLOR: Record<Comment['status'], string> = {
  open: '#4263eb',
  resolved: '#2f9e44',
  drifted: '#f08c00',
  orphaned: '#868e96',
}

const DRAG_THRESHOLD = 4

const authorLabel = (kind: Comment['author_kind'] | undefined): string =>
  kind === 'ai' ? 'AI' : kind === 'human' ? 'Human' : 'Unknown'

const AnchorLine = z.object({source: z.object({line: z.number().nullable().optional()})})

const basename = (path: string): string => path.split('/').pop() ?? path

const anchorLabel = (row: Comment | undefined): string | null => {
  if (!row?.anchor_file) return null
  const parsed = AnchorLine.safeParse(row.anchor)
  const line = parsed.success ? parsed.data.source.line : null
  return line == null ? basename(row.anchor_file) : `${basename(row.anchor_file)}:${line}`
}

type Drag = {cid: string; x: number; y: number}
type Prompt = {cid: string; x: number; y: number; origin: {x: number; y: number}}

function PinsLayer(props: MountPinsOpts): JSX.Element {
  const pinsMap = props.doc.getMap<PinGeometry>(PINS_KEY)
  const [pins, setPins] = createSignal<PinGeometry[]>([...pinsMap.values()])
  const sync = (): void => {
    setPins([...pinsMap.values()])
  }
  pinsMap.observe(sync)
  onCleanup(() => pinsMap.unobserve(sync))

  const comments = useLiveQuery((q) => q.from({c: getCommentsCollection()}))
  const byCid = createMemo(() => new Map(comments.data.map((c) => [c.cid, c])))

  const [drag, setDrag] = createSignal<Drag | null>(null)
  const [prompt, setPrompt] = createSignal<Prompt | null>(null)

  const writePin = (cid: string, patch: Partial<PinGeometry>): void => {
    const current = pinsMap.get(cid)
    if (!current) return
    props.doc.transact(() => pinsMap.set(cid, {...current, ...patch}), ORIGIN.USER)
  }

  const posOf = (pin: PinGeometry): {x: number; y: number} => {
    const d = drag()
    return d && d.cid === pin.cid ? {x: d.x, y: d.y} : {x: pin.x, y: pin.y}
  }

  const disconnect = (p: Prompt): void => {
    getCommentsCollection().update(p.cid, (draft) => {
      draft.kind = 'floating'
      draft.anchor = null
      draft.anchor_file = null
      draft.anchor_component = null
      draft.anchor_hash = null
    })
    writePin(p.cid, {x: p.x, y: p.y, pinState: 'offset', anchorX: undefined, anchorY: undefined})
    setPrompt(null)
  }

  const keep = (p: Prompt): void => {
    writePin(p.cid, {x: p.x, y: p.y, pinState: 'offset', anchorX: p.origin.x, anchorY: p.origin.y})
    setPrompt(null)
  }

  return (
    <>
      <For each={pins()}>
        {(pin) => {
          const row = (): Comment | undefined => byCid().get(pin.cid)
          const status = (): Comment['status'] => row()?.status ?? 'open'
          const anchor = (): string | null => anchorLabel(row())
          const pos = (): {x: number; y: number} => posOf(pin)
          let start: {px: number; py: number; ox: number; oy: number} | null = null
          return (
            <>
              <Show when={pin.pinState === 'offset' && pin.anchorX != null && pin.anchorY != null}>
                <svg
                  data-whiteboard-tether={pin.cid}
                  style={{position: 'absolute', inset: '0', width: '100%', height: '100%', 'pointer-events': 'none'}}
                >
                  <line
                    x1={pin.anchorX}
                    y1={pin.anchorY}
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
                data-whiteboard-pin={pin.cid}
                data-status={status()}
                data-pin-state={pin.pinState}
                aria-label={`${authorLabel(row()?.author_kind)} comment, ${status()}`}
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
                  const d = drag()
                  start = null
                  setDrag(null)
                  if (!began) return
                  const moved =
                    d &&
                    d.cid === pin.cid &&
                    (Math.abs(d.x - began.ox) > DRAG_THRESHOLD || Math.abs(d.y - began.oy) > DRAG_THRESHOLD)
                  if (!moved) {
                    props.onOpen?.(pin.cid)
                    return
                  }
                  if (row()?.kind === 'source-linked')
                    setPrompt({cid: pin.cid, x: d!.x, y: d!.y, origin: {x: began.ox, y: began.oy}})
                  else writePin(pin.cid, {x: d!.x, y: d!.y})
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') props.onOpen?.(pin.cid)
                  if (event.key === 'Escape') event.currentTarget.blur()
                }}
                style={{
                  position: 'absolute',
                  left: `${pos().x}px`,
                  top: `${pos().y}px`,
                  transform: 'translate(-50%, -50%)',
                  width: '24px',
                  height: '24px',
                  'border-radius': '50% 50% 50% 0',
                  border: '2px solid #fff',
                  background: STATUS_COLOR[status()],
                  cursor: 'grab',
                  'touch-action': 'none',
                  'pointer-events': 'auto',
                  'box-shadow': '0 1px 4px rgba(0,0,0,0.3)',
                }}
              />
              <Show when={anchor()}>
                {(label) => (
                  <span
                    data-whiteboard-pin-anchor={pin.cid}
                    style={{
                      position: 'absolute',
                      left: `${pos().x + 16}px`,
                      top: `${pos().y - 8}px`,
                      'font-size': '0.625rem',
                      'font-family': 'monospace',
                      color: '#495057',
                      background: '#fff',
                      border: '1px solid #dee2e6',
                      'border-radius': '4px',
                      padding: '1px 4px',
                      'pointer-events': 'none',
                      'white-space': 'nowrap',
                    }}
                  >
                    {label()}
                  </span>
                )}
              </Show>
            </>
          )
        }}
      </For>
      <Show when={prompt()}>
        {(p) => (
          <DragPrompt
            x={p().x}
            y={p().y}
            onDisconnect={() => disconnect(p())}
            onKeep={() => keep(p())}
            onCancel={() => setPrompt(null)}
          />
        )}
      </Show>
    </>
  )
}

export function mountPins(opts: MountPinsOpts): () => void {
  return render(() => <PinsLayer {...opts} />, opts.container)
}
