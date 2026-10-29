import {createMemo, createSignal, For, Match, Show, Switch, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import Check from 'lucide-solid/icons/check'
import ChevronDown from 'lucide-solid/icons/chevron-down'
import LayoutTemplate from 'lucide-solid/icons/layout-template'
import MessageCircleOff from 'lucide-solid/icons/message-circle-off'
import {Button, createListCollection, Select, TextField, TruncatedText} from '@conciv/ui-kit-system'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {
  UiAnswerSchema,
  UiInputSchema,
  type UiAnswer,
  type UiAnswerValue,
  type UiFormField,
  type UiInput,
} from '@conciv/protocol/ui-types'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {
  ActionRow,
  Chip,
  ChipRow,
  CodeBlock,
  DiffBlock,
  NoteRow,
  parseInput,
  parseResultPayload,
  StatusVisual,
  toolStatus,
} from '@conciv/ui-kit-chat/tools'
const LABEL: Record<UiInput['kind'], string> = {
  choices: 'choices',
  confirm: 'a confirmation',
  diff: 'a diff',
  form: 'a form',
}

const CONTAINER =
  'w-full min-w-0 overflow-hidden rounded-[var(--chat-radius-sm)] [border:1px_solid_var(--chat-frame-line)] [background:var(--chat-frame-bg)]'
const HEADER = 'flex items-center gap-2 px-3 py-2 [border-bottom:1px_solid_var(--chat-frame-line)]'
const MICROLABEL =
  'uppercase text-[length:var(--chat-text-micro)] leading-none tracking-[0.13em] [font-family:var(--chat-mono)] flex-none text-chat-microlabel'
const HEADER_TITLE = 'min-w-0 flex-1 truncate text-[length:var(--chat-text-md)] text-chat-frame-text font-medium'
const BODY = 'flex flex-col gap-2.5 px-3 py-2.5'
const QUESTION = 'text-[length:var(--chat-text-md)] [color:var(--chat-text)] font-semibold m-0'
const SENT = 'text-[length:var(--chat-text-xs)] [color:var(--chat-text-3)] m-0'
const CHOICE = 'min-h-11 flex-auto'
const ACTION = 'min-h-11 flex-1'

function Icon(): JSX.Element {
  return <LayoutTemplate size={14} aria-hidden="true" />
}

function title(kind: UiInput['kind'] | undefined): string {
  return kind ? `Rendered ${LABEL[kind]}` : 'Rendered UI'
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function answerPayload(part: ToolCallPart, result: ToolResultPart | undefined): unknown {
  const fromResult: unknown = parseResultPayload(result)
  if (fromResult !== undefined) return fromResult
  const fromPart: unknown = part.output
  return typeof fromPart === 'string' ? safeJson(fromPart) : fromPart
}

function uiAnswer(part: ToolCallPart, result: ToolResultPart | undefined): UiAnswer | null {
  const parsed = UiAnswerSchema.safeParse(answerPayload(part, result))
  return parsed.success ? parsed.data : null
}

function answeredValue(answer: UiAnswer | null): UiAnswerValue | null {
  return answer?.answered === true ? answer.value : null
}

function pickedFrom(value: UiAnswerValue | null): string[] {
  if (typeof value === 'string') return [value]
  return Array.isArray(value) ? value : []
}

function filledFrom(value: UiAnswerValue | null): [string, string][] {
  if (value === null || typeof value === 'string' || Array.isArray(value)) return []
  return Object.entries(value)
}

function Answered(props: {answer: UiAnswer | null}): JSX.Element {
  const settled = (): UiAnswerValue | null => answeredValue(props.answer)
  const chosen = (): string[] => pickedFrom(settled())
  const filled = (): [string, string][] => filledFrom(settled())
  const note = (): string => {
    const answer = props.answer
    if (answer === null) return 'This question is closed.'
    return answer.answered ? '' : answer.note
  }
  return (
    <div role="status" class="flex flex-col gap-1.5">
      <For each={chosen()}>
        {(value) => (
          <NoteRow icon={<Check size={12} aria-hidden="true" />} tone="accent">
            {value}
          </NoteRow>
        )}
      </For>
      <Show when={filled().length > 0}>
        <ChipRow>
          <For each={filled()}>{([name, value]) => <Chip name={name} value={value} />}</For>
        </ChipRow>
      </Show>
      <Show when={note()}>
        {(text) => (
          <NoteRow icon={<MessageCircleOff size={12} aria-hidden="true" />} tone="link">
            {text()}
          </NoteRow>
        )}
      </Show>
    </div>
  )
}

function Choices(props: {spec: UiInput; disabled: boolean; onAnswer: (value: UiAnswerValue) => void}): JSX.Element {
  const options = (): string[] => props.spec.options ?? []
  const multi = (): boolean => props.spec.multiSelect === true
  const composed = (): boolean => multi() || props.spec.allowOther === true
  const [picked, setPicked] = createSignal<string[]>([])
  const [other, setOther] = createSignal('')
  const toggle = (option: string) => {
    if (!multi()) setOther('')
    setPicked((current) => {
      if (!multi()) return [option]
      return current.includes(option) ? current.filter((value) => value !== option) : [...current, option]
    })
  }
  const typeOther = (value: string) => {
    setOther(value)
    if (!multi() && value.trim() !== '') setPicked([])
  }
  const chosen = (): string[] => {
    const typed = other().trim()
    return typed === '' ? picked() : [...picked(), typed]
  }
  const submit = (event: Event) => {
    event.preventDefault()
    const values = chosen()
    props.onAnswer(multi() ? values : (values[0] ?? ''))
  }
  return (
    <Show
      when={composed()}
      fallback={
        <ActionRow>
          <For each={options()}>
            {(option) => (
              <Button
                variant="accent-soft"
                class={CHOICE}
                disabled={props.disabled}
                onClick={() => props.onAnswer(option)}
              >
                {option}
              </Button>
            )}
          </For>
        </ActionRow>
      }
    >
      <form class="flex flex-col gap-2.5" onSubmit={submit}>
        <ActionRow>
          <For each={options()}>
            {(option) => (
              <Button
                type="button"
                variant={picked().includes(option) ? 'solid' : 'accent-soft'}
                aria-pressed={picked().includes(option)}
                class={CHOICE}
                disabled={props.disabled}
                onClick={() => toggle(option)}
              >
                {option}
              </Button>
            )}
          </For>
        </ActionRow>
        <Show when={props.spec.allowOther === true}>
          <TextField
            label="Other"
            disabled={props.disabled}
            value={other()}
            onInput={(event) => typeOther(event.currentTarget.value)}
          />
        </Show>
        <ActionRow>
          <Button type="submit" class={ACTION} disabled={props.disabled || chosen().length === 0}>
            Submit
          </Button>
        </ActionRow>
      </form>
    </Show>
  )
}

function Confirm(props: {spec: UiInput; disabled: boolean; onAnswer: (value: UiAnswerValue) => void}): JSX.Element {
  return (
    <>
      <Show when={props.spec.detail}>
        {(detail) => <CodeBlock file={{name: 'detail.txt', lang: 'text', contents: detail()}} />}
      </Show>
      <ActionRow>
        <Button class={ACTION} disabled={props.disabled} onClick={() => props.onAnswer('yes')}>
          Approve
        </Button>
        <Button variant="outline-danger" class={ACTION} disabled={props.disabled} onClick={() => props.onAnswer('no')}>
          Deny
        </Button>
      </ActionRow>
    </>
  )
}

function Diff(props: {spec: UiInput; disabled: boolean; onAnswer: (value: UiAnswerValue) => void}): JSX.Element {
  const name = () => props.spec.file ?? 'change'
  return (
    <>
      <DiffBlock file={{name: name(), before: props.spec.before ?? '', after: props.spec.after ?? ''}} />
      <ActionRow>
        <Button class={ACTION} disabled={props.disabled} onClick={() => props.onAnswer('apply')}>
          Apply
        </Button>
        <Button
          variant="outline-danger"
          class={ACTION}
          disabled={props.disabled}
          onClick={() => props.onAnswer('reject')}
        >
          Reject
        </Button>
      </ActionRow>
    </>
  )
}

function defaultValue(field: UiFormField): string {
  if (field.type === 'select') return field.options?.[0] ?? ''
  return ''
}

function SelectField(props: {
  field: UiFormField
  value: string
  disabled: boolean
  onChange: (value: string) => void
}): JSX.Element {
  const collection = createMemo(() => createListCollection({items: props.field.options ?? []}))
  return (
    <Select.Root
      collection={collection()}
      value={[props.value]}
      disabled={props.disabled}
      onValueChange={(details) => props.onChange(details.value[0] ?? '')}
      class="flex flex-col gap-1"
    >
      <Select.Label>{props.field.label}</Select.Label>
      <Select.Control>
        <Select.Trigger class="min-h-11">
          <Select.ValueText placeholder="Choose one" />
          <ChevronDown size={14} aria-hidden="true" />
        </Select.Trigger>
      </Select.Control>
      <Select.Positioner>
        <Select.Content>
          <For each={props.field.options ?? []}>
            {(option) => (
              <Select.Item item={option} class="min-h-11">
                <Select.ItemText>{option}</Select.ItemText>
              </Select.Item>
            )}
          </For>
        </Select.Content>
      </Select.Positioner>
    </Select.Root>
  )
}

function Form(props: {spec: UiInput; disabled: boolean; onAnswer: (value: UiAnswerValue) => void}): JSX.Element {
  const fields = (): UiFormField[] => props.spec.fields ?? []
  const [values, setValues] = createStore<Record<string, string>>({})
  const valueOf = (field: UiFormField): string => values[field.name] ?? defaultValue(field)
  const submit = (event: Event) => {
    event.preventDefault()
    props.onAnswer(Object.fromEntries(fields().map((field) => [field.name, valueOf(field)])))
  }
  return (
    <form class="flex flex-col gap-2.5" onSubmit={submit}>
      <For each={fields()}>
        {(field) => (
          <Show
            when={field.type === 'select'}
            fallback={
              <TextField
                label={field.label}
                disabled={props.disabled}
                value={valueOf(field)}
                onInput={(event) => setValues(field.name, event.currentTarget.value)}
              />
            }
          >
            <SelectField
              field={field}
              value={valueOf(field)}
              disabled={props.disabled}
              onChange={(value) => setValues(field.name, value)}
            />
          </Show>
        )}
      </For>
      <ActionRow>
        <Button type="submit" class={ACTION} disabled={props.disabled}>
          Submit
        </Button>
      </ActionRow>
    </form>
  )
}

function Pending(props: {spec: UiInput; disabled: boolean; onAnswer: (value: UiAnswerValue) => void}): JSX.Element {
  return (
    <Switch fallback={<Form spec={props.spec} disabled={props.disabled} onAnswer={props.onAnswer} />}>
      <Match when={props.spec.kind === 'choices'}>
        <Choices spec={props.spec} disabled={props.disabled} onAnswer={props.onAnswer} />
      </Match>
      <Match when={props.spec.kind === 'confirm'}>
        <Confirm spec={props.spec} disabled={props.disabled} onAnswer={props.onAnswer} />
      </Match>
      <Match when={props.spec.kind === 'diff'}>
        <Diff spec={props.spec} disabled={props.disabled} onAnswer={props.onAnswer} />
      </Match>
    </Switch>
  )
}

export function UiCard(props: ToolCardProps): JSX.Element {
  const input = () => parseInput(UiInputSchema, props.part)
  const question = () => input()?.question ?? input()?.title
  const answer = () => uiAnswer(props.part, props.result)
  const settled = () => answer() !== null || props.result !== undefined || props.part.state === 'error'
  const [sent, setSent] = createSignal(false)
  const answerWith = (value: UiAnswerValue) => {
    setSent(true)
    props.addResult(value)
  }
  return (
    <div class={CONTAINER}>
      <div class={HEADER}>
        <span class="text-chat-frame-text inline-flex shrink-0 items-center" aria-hidden="true">
          <Icon />
        </span>
        <span class={MICROLABEL}>UI</span>
        <TruncatedText class={HEADER_TITLE} text={title(input()?.kind)} />
        <StatusVisual status={toolStatus(props.part, props.result)} form="dot" />
      </div>
      <div class={BODY}>
        <Show when={question()}>{(text) => <p class={QUESTION}>{text()}</p>}</Show>
        <Show when={!settled()} fallback={<Answered answer={answer()} />}>
          <Show when={input()} fallback={<p class={SENT}>waiting for the form</p>}>
            {(spec) => <Pending spec={spec()} disabled={sent()} onAnswer={answerWith} />}
          </Show>
          <Show when={sent()}>
            <p role="status" class={SENT}>
              Sending your answer…
            </p>
          </Show>
        </Show>
      </div>
    </div>
  )
}
