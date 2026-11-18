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

const PIN_BASE = 'h-11 rounded-full cursor-grab touch-none pointer-events-auto focus-ring'
const PIN = `${PIN_BASE} w-11 grid place-items-center`
const PIN_TAGGED = `${PIN_BASE} flex gap-1 items-center ps-2.5 pe-1`
const PIN_MARK = 'relative size-6 rounded-full rounded-bl-none border-2 border-chat-text-hi shadow-chat'
const UNREAD_DOT = 'absolute -top-1 -right-1 size-2.5 rounded-chat-pill bg-chat-accent ring-2 ring-chat-panel'

const ANCHOR_TAG =
  'font-chat-mono text-chat-micro text-chat-text-2 bg-chat-panel border border-chat-line rounded-chat-surface-sm px-1 py-px whitespace-nowrap'

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
  const promptSource = (): string | undefined => {
    const cid = drag.promptCid()
    return cid === undefined ? undefined : anchorLabel(model.findRoot(cid))
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
              const tag = (): string | undefined => anchorLabel(comment())
              const position = (): {x: number; y: number} => {
                const scene = drag.scenePosition(pin)
                return sceneToScreen(view(), scene.x, scene.y)
              }
              onCleanup(() => model.registerPin(pin.cid, undefined))
              return (
                <div
                  class="left-0 top-0 absolute"
                  style={{transform: `translate(calc(${position().x}px - 1.375rem), calc(${position().y}px - 50%))`}}
                >
                  <ui.Tooltip value={label()}>
                    <button
                      type="button"
                      ref={(button) => model.registerPin(pin.cid, button)}
                      aria-label={label()}
                      class={tag() ? PIN_TAGGED : PIN}
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
                      <Show when={tag()}>{(text) => <span class={ANCHOR_TAG}>{text()}</span>}</Show>
                    </button>
                  </ui.Tooltip>
                </div>
              )
            }}
          </For>
        )}
      </Show>
      <DragPrompt
        source={promptSource()}
        anchor={drag.promptAnchor}
        open={drag.prompting()}
        onDisconnect={drag.disconnect}
        onKeep={drag.keep}
        onCancel={drag.cancel}
      />
    </>
  )
}
