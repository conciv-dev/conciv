import {For, Show, type JSX} from 'solid-js'
import type {QueuedMessage} from '@conciv/ui-kit-chat'
import {QueueItem, QueueItemProvider} from '@conciv/ui-kit-chat'

export type QueueStripProps = {queue: readonly QueuedMessage[]}

const VISIBLE_LIMIT = 3

const STRIP =
  'flex flex-col gap-[3px] pt-[9px] pe-5 pb-[10px] ps-5 [background:var(--chat-queue-bg)] [border-block-start:1px_solid_var(--chat-line-soft)]'
const HEADER = 'flex items-center gap-[9px]'
const HEADER_LABEL =
  '[font-family:var(--chat-mono)] text-[9.5px] uppercase tracking-[0.13em] [color:var(--chat-microlabel)]'
const HEADER_META = '[font-family:var(--chat-mono)] text-[11px] [color:var(--chat-text-3)]'
const ROW = 'flex items-center gap-1.5 min-w-0'
const BRANCH = 'flex-none [font-family:var(--chat-mono)] text-[12px] [color:var(--chat-glyph)]'
const MARK = 'flex-none text-[11px] [color:var(--chat-faint)]'
const TEXT = 'flex-1 min-w-0 truncate text-[12.5px] [font-family:var(--chat-font)] [color:var(--chat-text-2)]'
const STATE = '[font-family:var(--chat-mono)] text-[9.5px] uppercase tracking-[0.1em] [color:var(--chat-faint)]'
const ACTION =
  'flex-none px-1.5 py-0.5 rounded-[var(--chat-radius-sm)] bg-transparent [border:none] cursor-pointer text-[10.5px] [transition:color_120ms_var(--chat-ease),background-color_120ms_var(--chat-ease)] hover:[background:var(--chat-fill)] focus-visible:[outline:var(--chat-focus)] focus-visible:[outline-offset:0.125rem]'
const REMOVE = `${ACTION} [color:var(--chat-text-3)] hover:[color:var(--chat-danger)]`
const STEER = `${ACTION} [color:var(--chat-accent)]`
const MORE_ROW = `${ROW} ${STATE}`

function branchGlyph(last: boolean): string {
  return last ? '└─' : '├─'
}

export function QueueStrip(props: QueueStripProps): JSX.Element {
  const visible = () => props.queue.slice(0, VISIBLE_LIMIT)
  const overflow = () => Math.max(0, props.queue.length - VISIBLE_LIMIT)
  const lastVisibleIndex = () => visible().length - 1
  return (
    <Show when={props.queue.length > 0}>
      <div class={STRIP}>
        <div class={HEADER}>
          <span class={HEADER_LABEL}>Queue</span>
          <span class={HEADER_META}>{props.queue.length} waiting · runs in order</span>
        </div>
        <ul class="flex flex-col m-0 p-0 list-none">
          <For each={visible()}>
            {(item, index) => (
              <QueueItemProvider value={item}>
                <li class={ROW}>
                  <span class={BRANCH} aria-hidden="true">
                    {branchGlyph(index() === lastVisibleIndex() && overflow() === 0)}
                  </span>
                  <span class={MARK} aria-hidden="true">
                    ◦
                  </span>
                  <QueueItem.Text class={TEXT} />
                  <QueueItem.Steer class={STEER}>Steer</QueueItem.Steer>
                  <QueueItem.Remove class={REMOVE}>Remove</QueueItem.Remove>
                  <span class={STATE}>queued</span>
                </li>
              </QueueItemProvider>
            )}
          </For>
          <Show when={overflow() > 0}>
            <li class={MORE_ROW}>
              <span class={BRANCH} aria-hidden="true">
                └─
              </span>
              <span>+{overflow()} more</span>
            </li>
          </Show>
        </ul>
      </div>
    </Show>
  )
}
