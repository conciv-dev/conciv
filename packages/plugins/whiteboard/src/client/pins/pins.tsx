import {For, onCleanup, Show, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import type {Context} from '@conciv/plugin/experimental'
import {sceneToScreen, screenToScene, type Viewport} from '../../canvas/coords.js'
import {useComments, type Comment, type Pin} from '../model/comments.js'

type CommentStatus = Comment['status']

const STATUS_FILL: Record<CommentStatus, string> = {
  open: 'bg-chat-accent',
  resolved: 'bg-chat-success',
  drifted: 'bg-chat-warn',
  orphaned: 'bg-chat-dim',
}

const PIN = 'size-11 grid place-items-center rounded-full cursor-grab touch-none pointer-events-auto focus-ring'
const PIN_MARK = 'relative size-6 rounded-full rounded-bl-none border-2 border-chat-text-hi shadow-chat'
const UNREAD_DOT = 'absolute -top-1 -right-1 size-2.5 rounded-chat-pill bg-chat-accent ring-2 ring-chat-panel'

const DRAG_THRESHOLD = 4

type Drag = {cid: string; grabX: number; grabY: number; originX: number; originY: number; x: number; y: number}

const authorLabel = (kind: Comment['authorKind'] | undefined): string =>
  kind === 'ai' ? 'AI' : kind === 'human' ? 'Human' : 'Unknown'

const pinLabel = (comment: Comment | undefined, status: CommentStatus, unread: boolean): string =>
  `${authorLabel(comment?.authorKind)} comment, ${status}${unread ? ', unread' : ''}`

const movedPastThreshold = (drag: Drag): boolean =>
  Math.abs(drag.x - drag.originX) > DRAG_THRESHOLD || Math.abs(drag.y - drag.originY) > DRAG_THRESHOLD

export function PinsLayer(props: {ui: Context['ui']}): JSX.Element {
  const model = useComments()
  const [state, setState] = createStore<{drag: Drag | null}>({drag: null})

  const scenePosition = (pin: Pin): {x: number; y: number} => {
    const drag = state.drag
    return drag && drag.cid === pin.cid ? {x: drag.x, y: drag.y} : {x: pin.x, y: pin.y}
  }

  const grab = (view: Viewport, pin: Pin, event: PointerEvent & {currentTarget: HTMLButtonElement}): void => {
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

  const follow = (view: Viewport, pin: Pin, event: PointerEvent): void => {
    const drag = state.drag
    if (!drag || drag.cid !== pin.cid) return
    const scene = screenToScene(view, event.clientX, event.clientY)
    setState('drag', {x: scene.x + drag.grabX, y: scene.y + drag.grabY})
    if (movedPastThreshold(drag)) model.closeThread()
  }

  const drop = (pin: Pin, comment: Comment | undefined): void => {
    const drag = state.drag
    setState('drag', null)
    if (drag?.cid !== pin.cid) return
    if (!movedPastThreshold(drag)) return model.toggleThread(pin.cid)
    if (comment?.kind !== 'source-linked') model.movePin(pin.cid, {x: drag.x, y: drag.y})
  }

  return (
    <Show when={model.viewport()}>
      {(view) => (
        <For each={model.pins()}>
          {(pin) => {
            const comment = (): Comment | undefined => model.findRoot(pin.cid)
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
                <props.ui.Tooltip value={label()}>
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
                </props.ui.Tooltip>
              </div>
            )
          }}
        </For>
      )}
    </Show>
  )
}
