import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolComponent, ToolProps} from '@conciv/plugin/experimental'
import {BasicTool, ErrorBlock, parseResultMedia} from '@conciv/ui-kit-chat/tools'

const FailureDetailSchema = z.object({error: z.string(), reason: z.string().optional()}).loose()

export type Failure = z.infer<typeof FailureDetailSchema>

export function readMedia(output: string | undefined): {json: unknown; imageUrl?: string} {
  if (!output) return {json: undefined}
  return parseResultMedia({type: 'tool-result', toolCallId: '', content: output, state: 'complete'})
}

export function readFailure(output: string | undefined): Failure | null {
  const parsed = FailureDetailSchema.safeParse(readMedia(output).json)
  return parsed.success ? parsed.data : null
}

function WhiteboardFailedCard(props: ToolProps): JSX.Element {
  return (
    <BasicTool {...props} status="error" trigger={{title: props.tool}} hasContent={true}>
      <ErrorBlock message={props.error || 'the tool call failed'} />
    </BasicTool>
  )
}

export const whiteboardFailedCard: ToolComponent = WhiteboardFailedCard

export function failureMessage(failure: Failure): string {
  return failure.reason ? `${failure.error} · ${failure.reason}` : failure.error
}

export type FieldTone = 'default' | 'danger'

export type Field = {label: string; value: string; tone?: FieldTone}

const VALUE_TONE: Record<FieldTone, string> = {
  default: 'text-chat-target',
  danger: 'text-chat-danger',
}

const MICROLABEL = 'text-chat-micro font-chat-mono uppercase tracking-wider'

function FieldRow(props: Field): JSX.Element {
  return (
    <div class="flex gap-2 min-w-0 items-baseline">
      <span class={`${MICROLABEL} text-chat-microlabel leading-4.5 flex-none w-20 truncate`}>{props.label}</span>
      <span class={`text-chat-sm font-chat-mono flex-1 min-w-0 truncate ${VALUE_TONE[props.tone ?? 'default']}`}>
        {props.value}
      </span>
    </div>
  )
}

export function FieldRows(props: {rows: Field[]}): JSX.Element {
  return (
    <Show when={props.rows.length > 0}>
      <div class="flex flex-col gap-0.5 min-w-0">
        <For each={props.rows}>{(field) => <FieldRow label={field.label} value={field.value} tone={field.tone} />}</For>
      </div>
    </Show>
  )
}

const OP_TAG_TONE: Record<FieldTone, string> = {
  default: 'text-chat-microlabel',
  danger: 'text-chat-danger',
}

export function OpTag(props: {op: string; tone?: FieldTone}): JSX.Element {
  return (
    <span class={`${MICROLABEL} leading-4 inline-flex flex-none items-center ${OP_TAG_TONE[props.tone ?? 'default']}`}>
      {props.op}
    </span>
  )
}

export function MonoLine(props: {text: string; tone?: FieldTone}): JSX.Element {
  return (
    <p class={`text-chat-sm font-chat-mono min-w-0 truncate ${VALUE_TONE[props.tone ?? 'default']}`}>{props.text}</p>
  )
}
