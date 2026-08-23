import {Show, type Component, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {TruncatedText} from '@conciv/ui-kit-system'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {toolStatus, type ToolStatus} from '../primitives/tool-status.js'
import {formatDuration} from '../primitives/tool-util.js'
import {useToolCallDuration} from '../primitives/tool-duration.js'
import {StatusVisual} from '../primitives/status-visual.js'
import {createAutoCollapse} from '../../primitives/util/create-auto-collapse.js'
import {CardHeadline, CARD_HEADLINE_TEXT} from './card-headline.js'
import {CollapsibleCard, type CardVariant} from './collapsible-card.js'
import {publishCardHeader, useEmbeddedCard, useEmbeddedRowLine} from './card-chrome.js'
import type {EmbeddedCardHeader} from '../primitives/tool-row.js'

const TITLE = `text-chat-text flex-1 min-w-0 truncate ${CARD_HEADLINE_TEXT}`
const SUBTITLE = `text-chat-text-3 flex-none min-w-0 max-w-[45%] truncate ${CARD_HEADLINE_TEXT}`
const METRIC = `text-chat-text-3 text-[length:var(--chat-text-xs)] flex-none min-w-0 max-w-[35%] truncate [font-family:var(--chat-mono)] tabular-nums ${CARD_HEADLINE_TEXT}`
const EMBEDDED_SUBTITLE = 'block text-chat-text-3 text-[length:var(--chat-text-xs)] m-0 min-w-0'
const MICROLABEL =
  'uppercase text-[length:var(--chat-text-micro)] leading-none tracking-[0.13em] [font-family:var(--chat-mono)] flex-none text-chat-microlabel'
const TERMINAL_TITLE = `min-w-0 flex-1 truncate text-[length:var(--chat-text-md)] text-chat-frame-text font-medium ${CARD_HEADLINE_TEXT}`
const TERMINAL_META = `flex-none min-w-0 max-w-[45%] truncate text-[length:var(--chat-text-xs)] text-chat-text-3 [font-family:var(--chat-mono)] tabular-nums ${CARD_HEADLINE_TEXT}`

function HeadlineText(props: {reveal: boolean; class: string; text: string}): JSX.Element {
  return (
    <Show when={props.reveal} fallback={<span class={props.class}>{props.text}</span>}>
      <TruncatedText class={props.class} text={props.text} />
    </Show>
  )
}

function TerminalHeaderContent(props: {
  label: string
  title: string
  meta: string | undefined
  duration: string | undefined
  status: ToolStatus
  reveal: boolean
}): JSX.Element {
  return (
    <>
      <span class={MICROLABEL}>{props.label}</span>
      <CardHeadline class="flex-1">
        <HeadlineText reveal={props.reveal} class={TERMINAL_TITLE} text={props.title} />
        <Show when={props.meta}>
          {(meta) => <HeadlineText reveal={props.reveal} class={TERMINAL_META} text={meta()} />}
        </Show>
        <Show when={props.duration}>
          {(value) => <HeadlineText reveal={props.reveal} class={TERMINAL_META} text={value()} />}
        </Show>
      </CardHeadline>
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
  reveal: boolean
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
      <CardHeadline class="flex-1">
        <HeadlineText reveal={props.reveal} class={TITLE} text={props.title} />
        <Show when={props.subtitle}>
          {(subtitle) => <HeadlineText reveal={props.reveal} class={SUBTITLE} text={subtitle()} />}
        </Show>
        <Show when={props.meta}>{(meta) => <HeadlineText reveal={props.reveal} class={METRIC} text={meta()} />}</Show>
        <Show when={props.duration}>
          {(value) => <HeadlineText reveal={props.reveal} class={METRIC} text={value()} />}
        </Show>
      </CardHeadline>
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
  const reveal = () => props.titleTooltip === undefined
  const defaultHeader = (): JSX.Element => {
    if (props.variant === 'terminal') {
      return (
        <TerminalHeaderContent
          label={props.microlabel ?? props.title}
          title={props.subtitle ?? props.title}
          meta={props.meta}
          duration={duration()}
          status={status()}
          reveal={reveal()}
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
        reveal={reveal()}
      />
    )
  }
  const embeddedBody = (): JSX.Element => (
    <>
      <Show when={bodySubtitle()}>{(subtitle) => <TruncatedText class={EMBEDDED_SUBTITLE} text={subtitle()} />}</Show>
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
