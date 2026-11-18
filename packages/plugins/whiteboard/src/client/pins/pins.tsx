import {For, onCleanup, Show, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {z} from 'zod'
import {usePlugin} from '@conciv/plugin/experimental'
import {sceneToScreen, screenToScene, type Viewport} from '../../canvas/coords.js'
import type {CommentRow, PinRow} from '../../shared/rows.js'
import {useComments} from '../model/comments.js'
import {DragPrompt} from './drag-prompt.js'

type CommentStatus = CommentRow['status']

const STATUS_FILL: Record<CommentStatus, string> = {
  open: 'bg-chat-accent',
  resolved: 'bg-chat-success',
  drifted: 'bg-chat-warn',
  orphaned: 'bg-chat-dim',
}

const PIN = 'size-11 grid place-items-center rounded-full cursor-grab touch-none pointer-events-auto focus-ring'
const PIN_MARK = 'relative size-6 rounded-full rounded-bl-none border-2 border-chat-text-hi shadow-chat'
const UNREAD_DOT = 'absolute -top-1 -right-1 size-2.5 rounded-chat-pill bg-chat-accent ring-2 ring-chat-panel'

const ANCHOR_TAG =
  'absolute start-9.5 top-3.5 font-chat-mono text-chat-micro text-chat-text-2 bg-chat-panel border border-chat-line rounded-chat-surface-sm px-1 py-px pointer-events-none whitespace-nowrap'

const DRAG_THRESHOLD = 4
const AnchorLine = z.object({source: z.object({line: z.number().nullable().optional()})})

type Drag = {cid: string; grabX: number; grabY: number; originX: number; originY: number; x: number; y: number}
type Prompt = {cid: string; x: number; y: number; originX: number; originY: number}

const authorLabel = (kind: CommentRow['authorKind'] | undefined): string =>
  kind === 'ai' ? 'AI' : kind === 'human' ? 'Human' : 'Unknown'

const pinLabel = (comment: CommentRow | undefined, status: CommentStatus, unread: boolean): string =>
  `${authorLabel(comment?.authorKind)} comment, ${status}${unread ? ', unread' : ''}`

const basename = (path: string): string => path.split('/').pop() ?? path

const anchorLabel = (comment: CommentRow | undefined): string | undefined => {
  if (!comment?.anchorFile) return undefined
  const parsed = AnchorLine.safeParse(comment.anchor)
  const line = parsed.success ? parsed.data.source.line : null
  return line == null ? basename(comment.anchorFile) : `${basename(comment.anchorFile)}:${line}`
}

const movedPastThreshold = (drag: Drag): boolean =>
  Math.abs(drag.x - drag.originX) > DRAG_THRESHOLD || Math.abs(drag.y - drag.originY) > DRAG_THRESHOLD

export function PinsLayer(): JSX.Element {
  const ui = usePlugin().ui
  const model = useComments()
  const [state, setState] = createStore<{drag: Drag | null; prompt: Prompt | null}>({drag: null, prompt: null})

  const scenePosition = (pin: PinRow): {x: number; y: number} => {
    const held = [state.drag, state.prompt].find((entry) => entry?.cid === pin.cid)
    return held ? {x: held.x, y: held.y} : {x: pin.x, y: pin.y}
  }

  const disconnect = (entry: Prompt): void => {
    model.detachAnchor(entry.cid)
    model.movePin(entry.cid, {x: entry.x, y: entry.y, pinState: 'offset'})
    setState('prompt', null)
  }
  const keep = (entry: Prompt): void => {
    model.movePin(entry.cid, {
      x: entry.x,
      y: entry.y,
      pinState: 'offset',
      anchorX: entry.originX,
      anchorY: entry.originY,
    })
    setState('prompt', null)
  }
  const promptAnchor = (): HTMLButtonElement | undefined =>
    state.prompt ? model.pinButton(state.prompt.cid) : undefined

  const grab = (view: Viewport, pin: PinRow, event: PointerEvent & {currentTarget: HTMLButtonElement}): void => {
    event.preventDefault()
    const down = screenToScene(view, event.clientX, event.clientY)
    setState('drag', {
      cid: pin.cid,
      grabX: pin.x - down.x,
      grabY: pin.y - down.y,
      originX: pin.x,
      originY: pin.y,
      x: pin.x,
      y: pin.y,
    })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const follow = (view: Viewport, pin: PinRow, event: PointerEvent): void => {
    const drag = state.drag
    if (!drag || drag.cid !== pin.cid) return
    const scene = screenToScene(view, event.clientX, event.clientY)
    setState('drag', {x: scene.x + drag.grabX, y: scene.y + drag.grabY})
    if (movedPastThreshold(drag)) model.closeThread()
  }

  const release = (drag: Drag, comment: CommentRow | undefined): void => {
    if (!movedPastThreshold(drag)) return model.toggleThread(drag.cid)
    if (comment?.kind !== 'source-linked') return model.movePin(drag.cid, {x: drag.x, y: drag.y})
    setState('prompt', {cid: drag.cid, x: drag.x, y: drag.y, originX: drag.originX, originY: drag.originY})
  }
  const drop = (pin: PinRow, comment: CommentRow | undefined): void => {
    const drag = state.drag
    setState('drag', null)
    if (drag?.cid === pin.cid) release(drag, comment)
  }

  return (
    <>
      <Show when={model.viewport()}>
        {(view) => (
          <For each={model.pins()}>
            {(pin) => {
              const comment = (): CommentRow | undefined => model.findRoot(pin.cid)
              const status = (): CommentStatus => comment()?.status ?? 'open'
              const label = (): string => pinLabel(comment(), status(), model.isUnread(pin.cid))
              const position = (): {x: number; y: number} => {
                const scene = scenePosition(pin)
                return sceneToScreen(view(), scene.x, scene.y)
              }
              onCleanup(() => model.registerPin(pin.cid, undefined))
              return (
                <div
                  class="left-0 top-0 absolute"
                  style={{transform: `translate(calc(${position().x}px - 50%), calc(${position().y}px - 50%))`}}
                >
                  <ui.Tooltip value={label()}>
                    <button
                      type="button"
                      ref={(button) => model.registerPin(pin.cid, button)}
                      aria-label={label()}
                      class={PIN}
                      onPointerDown={(event) => grab(view(), pin, event)}
                      onPointerMove={(event) => follow(view(), pin, event)}
                      onPointerUp={() => drop(pin, comment())}
                      onPointerCancel={() => setState('drag', null)}
                      onClick={(event) => event.detail === 0 && model.toggleThread(pin.cid)}
                    >
                      <span class={`${PIN_MARK}  ${STATUS_FILL[status()]}`}>
                        <Show when={model.isUnread(pin.cid)}>
                          <span class={UNREAD_DOT} aria-hidden="true" />
                        </Show>
                      </span>
                    </button>
                  </ui.Tooltip>
                  <Show when={anchorLabel(comment())}>{(tag) => <span class={ANCHOR_TAG}>{tag()}</span>}</Show>
                </div>
              )
            }}
          </For>
        )}
      </Show>
      <DragPrompt
        anchor={promptAnchor}
        open={state.prompt !== null}
        onDisconnect={() => state.prompt && disconnect(state.prompt)}
        onKeep={() => state.prompt && keep(state.prompt)}
        onCancel={() => setState('prompt', null)}
      />
    </>
  )
}
