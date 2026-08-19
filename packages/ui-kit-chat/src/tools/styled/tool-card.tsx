import {Show, type Component, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {toolStatus, type ToolStatus} from '../primitives/tool-status.js'
import {formatDuration} from '../primitives/tool-util.js'
import {useToolCallDuration} from '../primitives/tool-duration.js'
import {StatusVisual} from '../primitives/status-visual.js'
import {createAutoCollapse} from '../../primitives/util/create-auto-collapse.js'
import {CollapsibleCard, type CardVariant} from './collapsible-card.js'
import {publishCardHeader, useEmbeddedCard, useEmbeddedRowLine} from './card-chrome.js'
import type {EmbeddedCardHeader} from '../primitives/tool-row.js'

const TITLE = 'text-chat-text flex-1 min-w-0 truncate'
const SUBTITLE = 'text-chat-text-3 flex-none min-w-0 max-w-[45%] truncate'
const METRIC =
  'text-chat-text-3 text-[length:var(--chat-text-xs)] flex-none min-w-0 max-w-[35%] truncate [font-family:var(--chat-mono)] tabular-nums'
const EMBEDDED_SUBTITLE = 'text-chat-text-3 text-[length:var(--chat-text-xs)] m-0 min-w-0 truncate'
const MICROLABEL =
  'uppercase text-[length:var(--chat-text-micro)] leading-none tracking-[0.13em] [font-family:var(--chat-mono)] flex-none text-chat-microlabel'
const TERMINAL_TITLE = 'min-w-0 flex-1 truncate text-[length:var(--chat-text-md)] text-chat-frame-text font-medium'
const TERMINAL_META =
  'flex-none min-w-0 max-w-[45%] truncate text-[length:var(--chat-text-xs)] text-chat-text-3 [font-family:var(--chat-mono)] tabular-nums'

function TerminalHeaderContent(props: {
  label: string
  title: string
  meta: string | undefined
  duration: string | undefined
  status: ToolStatus
}): JSX.Element {
  return (
    <>
      <span class={MICROLABEL}>{props.label}</span>
      <span class={TERMINAL_TITLE}>{props.title}</span>
      <Show when={props.meta}>{(meta) => <span class={TERMINAL_META}>{meta()}</span>}</Show>
      <Show when={props.duration}>{(value) => <span class={TERMINAL_META}>{value()}</span>}</Show>
      <StatusVisual status={props.status} form="dot" />
    </>
  )
}

function HeaderContent(props: {
  Icon: Component | undefined
  title: string
  subtitle: string | undefined
  meta: string | undefined
  duration: string | undefined
  status: ToolStatus
}): JSX.Element {
  return (
    <>
      <Show when={props.Icon}>
        {(Icon) => (
          <span class="text-chat-text-3 inline-flex shrink-0 items-center" aria-hidden="true">
            <Dynamic component={Icon()} />
          </span>
        )}
      </Show>
      <Show when={props.subtitle} fallback={<span class={TITLE}>{props.title}</span>}>
        {(subtitle) => (
          <>
            <span class={TITLE}>{props.title}</span>
            <span class={SUBTITLE}>{subtitle()}</span>
          </>
        )}
      </Show>
      <Show when={props.meta}>{(meta) => <span class={METRIC}>{meta()}</span>}</Show>
      <Show when={props.duration}>{(value) => <span class={METRIC}>{value()}</span>}</Show>
      <StatusVisual status={props.status} form="dot" />
    </>
  )
}

export function ToolCard(props: {
  Icon?: Component
  title: string
  subtitle?: string
  titleTooltip?: string
  part: ToolCallPart
  result: ToolResultPart | undefined
  meta?: string
  durationMs?: number
  defaultOpen?: boolean
  autoOpen?: boolean
  status?: ToolStatus
  header?: JSX.Element
  flushHeader?: boolean
  variant?: CardVariant
  microlabel?: string
  class?: string
  children?: JSX.Element
}): JSX.Element {
  const status = () => props.status ?? toolStatus(props.part, props.result)
  const ambientDuration = useToolCallDuration()
  const duration = () => formatDuration(props.durationMs ?? ambientDuration())
  const embedded = useEmbeddedCard()
  const collapse = createAutoCollapse({
    streaming: () => props.autoOpen === true || status() === 'approval',
    defaultOpen: props.defaultOpen,
  })
  publishCardHeader((): EmbeddedCardHeader => ({title: props.title, meta: props.meta, status: status()}))
  const rowLine = useEmbeddedRowLine()
  const bodySubtitle = () => {
    const subtitle = props.subtitle
    if (subtitle === undefined || subtitle.length === 0) return undefined
    return rowLine().includes(subtitle) ? undefined : subtitle
  }
  const defaultHeader = (): JSX.Element => {
    if (props.variant === 'terminal') {
      return (
        <TerminalHeaderContent
          label={props.microlabel ?? props.title}
          title={props.subtitle ?? props.title}
          meta={props.meta}
          duration={duration()}
          status={status()}
        />
      )
    }
    return (
      <HeaderContent
        Icon={props.Icon}
        title={props.title}
        subtitle={props.subtitle}
        meta={props.meta}
        duration={duration()}
        status={status()}
      />
    )
  }
  const embeddedBody = (): JSX.Element => (
    <>
      <Show when={bodySubtitle()}>{(subtitle) => <p class={EMBEDDED_SUBTITLE}>{subtitle()}</p>}</Show>
      {props.children}
    </>
  )
  return (
    <Show when={!embedded()} fallback={embeddedBody()}>
      <CollapsibleCard
        open={collapse.open()}
        onOpenChange={collapse.setOpen}
        tooltip={props.titleTooltip}
        flush={props.flushHeader}
        variant={props.variant}
        class={props.class}
        header={props.header ?? defaultHeader()}
      >
        {props.children}
      </CollapsibleCard>
    </Show>
  )
}
