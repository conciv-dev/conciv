import {Show, type Component, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {toolStatus, type ToolStatus} from '../primitives/tool-status.js'
import {formatDuration} from '../primitives/tool-util.js'
import {useToolCallDuration} from '../primitives/tool-duration.js'
import {StatusVisual} from '../primitives/status-visual.js'
import {CollapsibleCard} from './collapsible-card.js'

const TITLE = 'text-[color:var(--chat-text)] flex-1 truncate [overflow-wrap:anywhere]'
const METRIC =
  'text-[color:var(--chat-text-3)] text-[length:var(--chat-text-xs)] shrink-0 [font-family:var(--chat-mono)] tabular-nums'

function HeaderContent(props: {
  Icon: Component
  title: string
  meta: string | undefined
  duration: string | undefined
  status: ToolStatus
}): JSX.Element {
  return (
    <>
      <span class="text-[color:var(--chat-text-3)] inline-flex shrink-0 items-center" aria-hidden="true">
        <Dynamic component={props.Icon} />
      </span>
      <span class={TITLE}>{props.title}</span>
      <Show when={props.meta}>{(meta) => <span class={METRIC}>{meta()}</span>}</Show>
      <Show when={props.duration}>{(value) => <span class={METRIC}>{value()}</span>}</Show>
      <StatusVisual status={props.status} form="dot" />
    </>
  )
}

export function ToolCard(props: {
  Icon: Component
  title: string
  titleTooltip?: string
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
      tooltip={props.titleTooltip}
      header={
        <HeaderContent
          Icon={props.Icon}
          title={props.title}
          meta={props.meta}
          duration={duration()}
          status={status()}
        />
      }
    >
      {props.children}
    </CollapsibleCard>
  )
}
