import {Show, type Component, type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {parseResultPayload, resultText, ToolCard, toolStatus} from '@conciv/ui-kit-chat'

const PageVerbErrorSchema = z.object({message: z.string()}).loose()

function readError(props: ToolCardProps): string | null {
  if (toolStatus(props.part, props.result) !== 'error') return null
  const shaped = PageVerbErrorSchema.safeParse(parseResultPayload(props.result))
  if (shaped.success) return shaped.data.message
  const text = resultText(props.result)
  return text.length > 0 ? text : 'tool failed'
}

function isRunning(props: ToolCardProps): boolean {
  return toolStatus(props.part, props.result) === 'running'
}

export function CardRows(props: {children: JSX.Element}): JSX.Element {
  return <div class="flex flex-col gap-0.5">{props.children}</div>
}

export function CardRow(props: {children: JSX.Element; style?: JSX.CSSProperties}): JSX.Element {
  return (
    <div
      class="text-[length:var(--chat-text-xs)] flex gap-2 [font-family:var(--chat-mono)] items-baseline"
      style={props.style}
    >
      {props.children}
    </div>
  )
}

export function CardNote(props: {children: JSX.Element; class?: string}): JSX.Element {
  return (
    <div class={`text-[length:var(--chat-text-xs)] [color:var(--chat-text-3)] ${props.class ?? ''}`}>
      {props.children}
    </div>
  )
}

export function CardErrorBlock(props: {children: JSX.Element}): JSX.Element {
  return (
    <div class="text-[length:var(--chat-text-xs)] p-2 rounded-[var(--chat-radius-sm)] flex flex-col gap-0.5 [border:1px_solid_var(--chat-danger-line)] [color:var(--chat-danger)] [font-family:var(--chat-mono)]">
      {props.children}
    </div>
  )
}

export function InspectionCard(props: {
  card: ToolCardProps
  Icon: Component
  summary: string
  children: JSX.Element
}): JSX.Element {
  const error = () => readError(props.card)
  const meta = () => (error() ? '' : isRunning(props.card) ? 'reading…' : props.summary)
  return (
    <ToolCard
      Icon={props.Icon}
      title={props.card.part.name}
      meta={meta()}
      part={props.card.part}
      result={props.card.result}
      status={error() ? 'error' : undefined}
    >
      <Show when={error()}>{(message) => <CardErrorBlock>{message()}</CardErrorBlock>}</Show>
      <Show when={!error() && !isRunning(props.card)}>{props.children}</Show>
    </ToolCard>
  )
}

export function ActionCard(props: {card: ToolCardProps; Icon: Component; summary: string}): JSX.Element {
  const error = () => readError(props.card)
  const meta = () => (error() ? '' : isRunning(props.card) ? 'running…' : props.summary)
  return (
    <ToolCard
      Icon={props.Icon}
      title={props.card.part.name}
      meta={meta()}
      part={props.card.part}
      result={props.card.result}
      status={error() ? 'error' : undefined}
    >
      <Show when={error()}>{(message) => <CardErrorBlock>{message()}</CardErrorBlock>}</Show>
    </ToolCard>
  )
}
