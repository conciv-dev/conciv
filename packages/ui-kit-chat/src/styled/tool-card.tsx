import {Show, type Component, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {toolStatus, type ToolStatus} from '../primitives/tools/tool-status.js'
import {formatDuration} from '../primitives/tools/tool-util.js'
import {useToolCallDuration} from '../primitives/tools/tool-duration.js'
import {CollapsibleCard} from './collapsible-card.js'

const DOT: Record<ToolStatus, string> = {
  running: '[background:var(--chat-accent)] anim-pulse motion-reduce:[animation:none]',
  complete: '[background:var(--chat-success)]',
  error: '[background:var(--chat-danger)]',
  approval: '[background:var(--chat-accent)]',
}

export function ToolCard(props: {
  Icon: Component
  title: string
  part: ToolCallPart
  result: ToolResultPart | undefined
  meta?: string
  durationMs?: number
  defaultOpen?: boolean
  status?: ToolStatus
  children?: JSX.Element
}): JSX.Element {
  const status = () => props.status ?? toolStatus(props.part, props.result)
  const ambientDuration = useToolCallDuration()
  const duration = () => formatDuration(props.durationMs ?? ambientDuration())
  return (
    <CollapsibleCard
      defaultOpen={props.defaultOpen ?? status() === 'approval'}
      header={
        <>
          <span class="text-[color:var(--chat-text-3)] inline-flex shrink-0 items-center" aria-hidden="true">
            <Dynamic component={props.Icon} />
          </span>
          <span class="text-[color:var(--chat-text)] flex-1 truncate [overflow-wrap:anywhere]">{props.title}</span>
          <Show when={props.meta}>
            <span class="text-[color:var(--chat-text-3)] text-[length:var(--chat-text-xs)] shrink-0 [font-family:var(--chat-mono)] tabular-nums">
              {props.meta}
            </span>
          </Show>
          <Show when={duration()}>
            {(value) => (
              <span class="text-[color:var(--chat-text-3)] text-[length:var(--chat-text-xs)] shrink-0 [font-family:var(--chat-mono)] tabular-nums">
                {value()}
              </span>
            )}
          </Show>
          <span class={`rounded-[var(--chat-radius-pill)] shrink-0 size-2 ${DOT[status()]}`} aria-hidden="true" />
        </>
      }
    >
      {props.children}
    </CollapsibleCard>
  )
}
