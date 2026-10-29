import {Show, splitProps, Switch, Match, type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {TruncatedText} from '@conciv/ui-kit-system'
import {
  CardShell,
  CodeBlock,
  ErrorBlock,
  JsonTree,
  cardHeader,
  parseResultPayload,
  resultText,
  toolStatus,
  type ToolStatus,
} from '@conciv/ui-kit-chat/tools'

const ErrorPayloadSchema = z.object({message: z.string()}).loose()

function readError(part: ToolCardProps['part'], result: ToolCardProps['result']): string | null {
  if (toolStatus(part, result) !== 'error') return null
  if (result?.error && result.error.length > 0) return result.error
  const shaped = ErrorPayloadSchema.safeParse(parseResultPayload(result))
  if (shaped.success && shaped.data.message.length > 0) return shaped.data.message
  const text = resultText(result)
  return text.length > 0 ? text : 'tool failed'
}

function isRunning(part: ToolCardProps['part'], result: ToolCardProps['result']): boolean {
  return toolStatus(part, result) === 'running'
}

export function settledCardBody(
  part: ToolCardProps['part'],
  result: ToolCardProps['result'],
  hasContent: boolean,
): boolean {
  if (readError(part, result) !== null) return true
  if (isRunning(part, result)) return false
  return hasContent
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

function isTreeable(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

export function JsonValue(props: {value: unknown; name?: string}): JSX.Element {
  return (
    <Switch>
      <Match when={isTreeable(props.value) && props.value}>{(value) => <JsonTree data={value()} />}</Match>
      <Match when={!isTreeable(props.value)}>
        <CodeBlock
          size="xs"
          file={{name: props.name ?? 'value.json', lang: 'json', contents: JSON.stringify(props.value, null, 2)}}
        />
      </Match>
    </Switch>
  )
}

export function ErrorRecord(props: {heading?: string; body: string}): JSX.Element {
  return (
    <div class="px-2.5 py-1.75 border border-chat-frame-line-error rounded-[var(--chat-radius-sm)] bg-chat-frame-bg flex flex-col gap-1 min-w-0">
      <Show when={props.heading}>
        {(heading) => (
          <TruncatedText
            class="text-[length:var(--chat-text-xs)] text-chat-text-2 leading-[var(--chat-trace-gutter)] m-0 min-w-0 block [font-family:var(--chat-mono)]"
            text={heading()}
          />
        )}
      </Show>
      <p class="text-[length:var(--chat-text-xs)] text-chat-frame-text-error leading-[var(--chat-trace-gutter)] m-0 [font-family:var(--chat-mono)]">
        {props.body}
      </p>
    </div>
  )
}

export function InspectionCard(
  props: ToolCardProps & {summary: string; failed?: boolean; children: JSX.Element},
): JSX.Element {
  const [local, card] = splitProps(props, ['summary', 'failed', 'children'])
  const {meta, title} = cardHeader(card)
  const error = () => readError(card.part, card.result)
  const running = () => isRunning(card.part, card.result)
  const subtitle = () => (error() || running() ? undefined : local.summary)
  const status = (): ToolStatus | undefined => (local.failed === true ? 'error' : undefined)
  return (
    <CardShell
      meta={meta()}
      title={title()}
      subtitle={subtitle()}
      part={card.part}
      result={card.result}
      durationMs={card.durationMs}
      status={status()}
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
