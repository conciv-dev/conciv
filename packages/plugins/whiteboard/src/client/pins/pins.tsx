import {For, Show, type JSX} from 'solid-js'
import type {Context} from '@conciv/plugin/experimental'
import {sceneToScreen} from '../../canvas/coords.js'
import {useComments, type Comment} from '../model/comments.js'

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

const authorLabel = (kind: Comment['authorKind'] | undefined): string =>
  kind === 'ai' ? 'AI' : kind === 'human' ? 'Human' : 'Unknown'

const pinLabel = (comment: Comment | undefined, status: CommentStatus, unread: boolean): string =>
  `${authorLabel(comment?.authorKind)} comment, ${status}${unread ? ', unread' : ''}`

export function PinsLayer(props: {ui: Context['ui']}): JSX.Element {
  const model = useComments()
  return (
    <Show when={model.viewport()}>
      {(view) => (
        <For each={model.pins()}>
          {(pin) => {
            const comment = (): Comment | undefined => model.findRoot(pin.cid)
            const status = (): CommentStatus => comment()?.status ?? 'open'
            const label = (): string => pinLabel(comment(), status(), model.isUnread(pin.cid))
            const position = (): {x: number; y: number} => sceneToScreen(view(), pin.x, pin.y)
            return (
              <div
                class="left-0 top-0 absolute"
                style={{transform: `translate(calc(${position().x}px - 50%), calc(${position().y}px - 50%))`}}
              >
                <props.ui.Tooltip value={label()}>
                  <button type="button" aria-label={label()} class={PIN} onClick={() => model.openThread(pin.cid)}>
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
