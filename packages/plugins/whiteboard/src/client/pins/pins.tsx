import {For, onCleanup, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {usePlugin} from '@conciv/plugin/experimental'
import {sceneToScreen} from '../../canvas/coords.js'
import type {CommentRow} from '../../shared/rows.js'
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

const AnchorLine = z.object({source: z.object({line: z.number().nullable().optional()})})

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

export function PinsLayer(): JSX.Element {
  const ui = usePlugin().ui
  const model = useComments()
  const drag = model.drag

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
                const scene = drag.scenePosition(pin)
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
                      onPointerDown={(event) => drag.grab(view(), pin, event)}
                      onPointerMove={(event) => drag.follow(view(), pin, event)}
                      onPointerUp={() => drag.drop(pin, comment())}
                      onPointerCancel={() => drag.abandon()}
                      onClick={(event) => event.detail === 0 && model.toggleThread(pin.cid)}
                      onKeyDown={(event) => event.key === 'Escape' && event.currentTarget.blur()}
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
        anchor={drag.promptAnchor}
        open={drag.prompting()}
        onDisconnect={drag.disconnect}
        onKeep={drag.keep}
        onCancel={drag.cancel}
      />
    </>
  )
}
