import {createMemo, createSignal, For, Match, Show, Switch, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {Check, ChevronDown, LayoutTemplate, MessageCircleOff} from 'lucide-solid'
import {SolidCodeBlock, SolidFileDiff, type FileDiffOptions} from '@conciv/solid-diffs'
import {Button, createListCollection, Select, TextField} from '@conciv/ui-kit-system'
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
  Chip,
  ChipRow,
  CODE_BLOCK_CLASS,
  CODE_BLOCK_OPTIONS,
  NoteRow,
  parseInput,
  parseResultPayload,
  ToolCard,
} from '@conciv/ui-kit-chat'

const LABEL: Record<UiInput['kind'], string> = {
  choices: 'choices',
  confirm: 'a confirmation',
  diff: 'a diff',
  form: 'a form',
}

const BODY = 'flex flex-col gap-2.5 py-1'
const QUESTION = 'text-[length:var(--chat-text-md)] [color:var(--chat-text)] font-semibold m-0'
const SENT = 'text-[length:var(--chat-text-xs)] [color:var(--chat-text-3)] m-0'
const ACTIONS = 'flex flex-wrap gap-2'
const CHOICE = 'min-h-11 flex-auto'
const ACTION = 'min-h-11 flex-1'
const DIFF_CLASS =
  'text-[length:var(--chat-text-xs)] rounded-[var(--chat-radius-sm)] [background:var(--chat-sunken)] max-h-80 max-w-full block overflow-auto'
const DIFF_OPTIONS: FileDiffOptions<undefined> = {
  theme: {light: 'github-light', dark: 'github-dark'},
  themeType: 'system',
  diffStyle: 'unified',
  overflow: 'wrap',
}

function Icon(): JSX.Element {
  return <LayoutTemplate size={14} />
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

function Answered(props: {answer: UiAnswer | null}): JSX.Element {
  const chosen = (): string | null => {
    const answer = props.answer
    if (answer?.answered !== true) return null
    return typeof answer.value === 'string' ? answer.value : null
  }
  const filled = (): [string, string][] => {
    const answer = props.answer
    if (answer?.answered !== true || typeof answer.value === 'string') return []
    return Object.entries(answer.value)
  }
  const note = (): string => {
    const answer = props.answer
    if (answer === null) return 'This question is closed.'
    return answer.answered ? '' : answer.note
  }
  return (
    <div role="status" class="flex flex-col gap-1.5">
      <Show when={chosen()}>
        {(value) => (
          <NoteRow icon={<Check size={12} aria-hidden="true" />} tone="accent">
            {value()}
          </NoteRow>
        )}
      </Show>
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
  return (
    <div class={ACTIONS}>
      <For each={props.spec.options ?? []}>
        {(option) => (
          <Button variant="accent-soft" class={CHOICE} disabled={props.disabled} onClick={() => props.onAnswer(option)}>
            {option}
          </Button>
        )}
      </For>
    </div>
  )
}

function Confirm(props: {spec: UiInput; disabled: boolean; onAnswer: (value: UiAnswerValue) => void}): JSX.Element {
  return (
    <>
      <Show when={props.spec.detail}>
        {(detail) => (
          <SolidCodeBlock
            class={CODE_BLOCK_CLASS}
            options={CODE_BLOCK_OPTIONS}
            file={{name: 'detail.txt', lang: 'text', contents: detail()}}
          />
        )}
      </Show>
      <div class={ACTIONS}>
        <Button class={ACTION} disabled={props.disabled} onClick={() => props.onAnswer('yes')}>
          Approve
        </Button>
        <Button variant="outline-danger" class={ACTION} disabled={props.disabled} onClick={() => props.onAnswer('no')}>
          Deny
        </Button>
      </div>
    </>
  )
}

function Diff(props: {spec: UiInput; disabled: boolean; onAnswer: (value: UiAnswerValue) => void}): JSX.Element {
  const name = () => props.spec.file ?? 'change'
  return (
    <>
      <SolidFileDiff
        class={DIFF_CLASS}
        options={DIFF_OPTIONS}
        oldFile={{name: name(), contents: props.spec.before ?? ''}}
        newFile={{name: name(), contents: props.spec.after ?? ''}}
      />
      <div class={ACTIONS}>
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
      </div>
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
      <div class={ACTIONS}>
        <Button type="submit" class={ACTION} disabled={props.disabled}>
          Submit
        </Button>
      </div>
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
    <ToolCard Icon={Icon} title={title(input()?.kind)} part={props.part} result={props.result} defaultOpen>
      <div class={BODY}>
        <Show when={question()}>{(text) => <p class={QUESTION}>{text()}</p>}</Show>
        <Show when={!settled()} fallback={<Answered answer={answer()} />}>
          <Show when={input()}>{(spec) => <Pending spec={spec()} disabled={sent()} onAnswer={answerWith} />}</Show>
          <Show when={sent()}>
            <p role="status" class={SENT}>
              Sending your answer…
            </p>
          </Show>
        </Show>
      </div>
    </ToolCard>
  )
}
