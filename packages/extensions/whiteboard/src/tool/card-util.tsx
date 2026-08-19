import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'

export const FailureDetailSchema = z.object({error: z.string(), reason: z.string().optional()}).loose()

export function failureOf(detail: unknown): z.infer<typeof FailureDetailSchema> | null {
  const parsed = FailureDetailSchema.safeParse(detail)
  return parsed.success ? parsed.data : null
}

export type FieldTone = 'default' | 'danger'

export type Field = {label: string; value: string; tone?: FieldTone}

const FIELD_ROW = 'flex items-baseline gap-2 min-w-0 leading-[18px]'
const FIELD_LABEL =
  'flex-none w-20 truncate uppercase text-[9.5px] tracking-[0.13em] [font-family:var(--chat-mono)] text-chat-microlabel'
const FIELD_VALUE_TONE: Record<FieldTone, string> = {
  default: 'min-w-0 flex-1 truncate text-[12px] [font-family:var(--chat-mono)] text-chat-target',
  danger: 'min-w-0 flex-1 truncate text-[12px] [font-family:var(--chat-mono)] text-chat-danger',
}

export function FieldRow(props: {label: string; value: string; tone?: FieldTone}): JSX.Element {
  return (
    <div class={FIELD_ROW}>
      <span class={FIELD_LABEL}>{props.label}</span>
      <span class={FIELD_VALUE_TONE[props.tone ?? 'default']}>{props.value}</span>
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
    <span
      class={`text-[9.5px] leading-[16px] tracking-[0.1em] inline-flex flex-none uppercase [font-family:var(--chat-mono)] items-center ${OP_TAG_TONE[props.tone ?? 'default']}`}
    >
      {props.op}
    </span>
  )
}

export function MonoLine(props: {text: string; tone?: FieldTone}): JSX.Element {
  return (
    <p
      class={`text-[12px] leading-[18px] m-0 min-w-0 truncate [font-family:var(--chat-mono)] ${props.tone === 'danger' ? 'text-chat-danger' : 'text-chat-target'}`}
    >
      {props.text}
    </p>
  )
}

const CLOCK_FORMAT = new Intl.DateTimeFormat(undefined, {hour: 'numeric', minute: '2-digit'})

export function clockTime(ms: number): string {
  return CLOCK_FORMAT.format(new Date(ms))
}
