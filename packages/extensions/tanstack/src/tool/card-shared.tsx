import {Show, splitProps, type JSX} from 'solid-js'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {CardShell, ErrorBlock, cardHeader, resultText, toolStatus} from '@conciv/ui-kit-chat/tools'

function readError(part: ToolCardProps['part'], result: ToolCardProps['result']): string | null {
  if (toolStatus(part, result) !== 'error') return null
  if (result?.error && result.error.length > 0) return result.error
  const text = resultText(result)
  return text.length > 0 ? text : 'tool failed'
}

function isRunning(part: ToolCardProps['part'], result: ToolCardProps['result']): boolean {
  return toolStatus(part, result) === 'running'
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

export function InspectionCard(props: ToolCardProps & {summary: string; children: JSX.Element}): JSX.Element {
  const [local, card] = splitProps(props, ['summary', 'children'])
  const {meta, title} = cardHeader(card)
  const error = () => readError(card.part, card.result)
  const running = () => isRunning(card.part, card.result)
  const subtitle = () => (error() || running() ? undefined : local.summary)
  return (
    <CardShell
      meta={meta()}
      title={title()}
      subtitle={subtitle()}
      part={card.part}
      result={card.result}
      durationMs={card.durationMs}
    >
      <Show when={error()}>{(message) => <ErrorBlock message={message()} />}</Show>
      <Show when={!error() && !running()}>{local.children}</Show>
    </CardShell>
  )
}

export function ActionCard(props: ToolCardProps & {summary: string}): JSX.Element {
  const [local, card] = splitProps(props, ['summary'])
  const {meta, title} = cardHeader(card)
  const error = () => readError(card.part, card.result)
  const running = () => isRunning(card.part, card.result)
  const subtitle = () => (error() || running() ? undefined : local.summary)
  return (
    <CardShell
      meta={meta()}
      title={title()}
      subtitle={subtitle()}
      part={card.part}
      result={card.result}
      durationMs={card.durationMs}
    >
      <Show when={error()}>{(message) => <ErrorBlock message={message()} />}</Show>
    </CardShell>
  )
}
