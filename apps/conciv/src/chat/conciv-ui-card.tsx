import {Show, Switch, Match, For, createMemo, createSignal, type JSX} from 'solid-js'
import {Button, Select, createListCollection} from '@conciv/ui-kit-system'
import {Check, ChevronDown} from 'lucide-solid'
import {SolidCodeBlock, type FileOptions} from '@conciv/solid-diffs'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {UiAnswerSchema, UiInputSchema, type UiAnswerValue, type UiInput} from '@conciv/protocol/ui-types'

const CARD = 'self-stretch flex flex-col gap-2.5 p-3 border border-pw-line rounded-pw-md bg-pw-fill-soft anim-msg-lg'
const QUESTION = 'font-semibold text-pw-text'
const DETAIL_OPTIONS: FileOptions<undefined> = {
  theme: {light: 'github-light', dark: 'github-dark'},
  themeType: 'system',
  disableFileHeader: true,
  disableLineNumbers: true,
  overflow: 'wrap',
}
const DETAIL_CLASS = 'block overflow-auto rounded-[0.4375rem] text-[0.6875rem]'
const ACTIONS = 'flex gap-2'
const ACTION = 'flex-1 min-h-[2.375rem] font-semibold leading-none'
const CHOICE = 'font-medium leading-none px-[0.8125rem] py-[0.5625rem] rounded-pw-pill min-h-9'
const INPUT =
  'py-2 px-2.5 border border-pw-line rounded-pw-sm bg-pw-fill text-pw-text [font:inherit] trans-border focus:outline-none focus:border-pw-accent'
const SETTLED = 'text-[0.75rem] text-pw-text-2'
const FIELD_LABEL = 'text-[0.75rem] text-pw-text-2'

function parseUiInput(argumentsJson: string): UiInput | null {
  try {
    const parsed = UiInputSchema.safeParse(JSON.parse(argumentsJson || '{}'))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function parseUiOutput(output: unknown): {answered: boolean; note?: string} | null {
  if (output === undefined || output === null) return null
  const value = typeof output === 'string' ? safeJson(output) : output
  const parsed = UiAnswerSchema.safeParse(value)
  if (!parsed.success) return null
  return parsed.data.answered ? {answered: true} : {answered: false, note: parsed.data.note}
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function Choices(props: {spec: UiInput; onAnswer: (value: UiAnswerValue) => void}): JSX.Element {
  return (
    <>
      <p class={QUESTION}>{props.spec.question}</p>
      <div class="flex flex-wrap gap-2">
        <For each={props.spec.options ?? []}>
          {(option) => (
            <Button variant="accent-soft" class={CHOICE} onClick={() => props.onAnswer(option)}>
              {option}
            </Button>
          )}
        </For>
      </div>
    </>
  )
}

function Confirm(props: {spec: UiInput; onAnswer: (value: UiAnswerValue) => void}): JSX.Element {
  return (
    <>
      <p class={QUESTION}>{props.spec.question}</p>
      <Show when={props.spec.detail}>
        {(detail) => (
          <SolidCodeBlock
            class={DETAIL_CLASS}
            options={DETAIL_OPTIONS}
            file={{name: 'detail.txt', lang: 'text', contents: detail()}}
          />
        )}
      </Show>
      <div class={ACTIONS}>
        <Button class={ACTION} onClick={() => props.onAnswer('yes')}>
          Approve
        </Button>
        <Button variant="outline-danger" class={ACTION} onClick={() => props.onAnswer('no')}>
          Deny
        </Button>
      </div>
    </>
  )
}

function splitLines(text: string): string[] {
  return text.length === 0 ? [] : text.split('\n')
}

function Diff(props: {spec: UiInput; onAnswer: (value: UiAnswerValue) => void}): JSX.Element {
  return (
    <>
      <div class="text-[0.75rem] text-pw-text-2 font-pw-mono">{props.spec.file}</div>
      <div class="text-[0.71875rem] leading-[1.5] font-pw-mono p-2 rounded-[0.4375rem] bg-pw-sunken overflow-x-auto">
        <For each={splitLines(props.spec.before ?? '')}>
          {(line) => <div class="text-pw-danger whitespace-pre">- {line}</div>}
        </For>
        <For each={splitLines(props.spec.after ?? '')}>
          {(line) => <div class="text-pw-success whitespace-pre">+ {line}</div>}
        </For>
      </div>
      <div class={ACTIONS}>
        <Button class={ACTION} onClick={() => props.onAnswer('apply')}>
          Apply
        </Button>
        <Button variant="outline-danger" class={ACTION} onClick={() => props.onAnswer('reject')}>
          Reject
        </Button>
      </div>
    </>
  )
}

function fieldValue(values: Record<string, string>, field: NonNullable<UiInput['fields']>[number]): string {
  const current = values[field.name]
  if (current !== undefined) return current
  if (field.type === 'select') return field.options?.[0] ?? ''
  return ''
}

function SelectField(props: {
  field: NonNullable<UiInput['fields']>[number]
  value: string
  onSelect: (value: string) => void
}): JSX.Element {
  const collection = createMemo(() => createListCollection({items: props.field.options ?? []}))
  return (
    <Select.Root
      class="flex flex-col gap-1"
      collection={collection()}
      value={[props.value]}
      onValueChange={(details) => {
        const next = details.value[0]
        if (next !== undefined) props.onSelect(next)
      }}
    >
      <Select.Label class={FIELD_LABEL}>{props.field.label}</Select.Label>
      <Select.Control>
        <Select.Trigger>
          <Select.ValueText class="truncate" placeholder="Choose an option" />
          <ChevronDown class="opacity-60 shrink-0 size-3.5" aria-hidden="true" />
        </Select.Trigger>
      </Select.Control>
      <Select.Positioner>
        <Select.Content>
          <For each={collection().items}>
            {(option) => (
              <Select.Item item={option}>
                <Select.ItemText>{option}</Select.ItemText>
                <Select.ItemIndicator class="hidden data-[state=checked]:inline-flex">
                  <Check class="size-4 block" aria-hidden="true" />
                </Select.ItemIndicator>
              </Select.Item>
            )}
          </For>
        </Select.Content>
      </Select.Positioner>
    </Select.Root>
  )
}

function Form(props: {spec: UiInput; onAnswer: (value: UiAnswerValue) => void}): JSX.Element {
  const [values, setValues] = createSignal<Record<string, string>>({})
  const set = (name: string, value: string) => setValues((prev) => ({...prev, [name]: value}))
  const fields = () => props.spec.fields ?? []
  const submit = (e: Event) => {
    e.preventDefault()
    props.onAnswer(Object.fromEntries(fields().map((field) => [field.name, fieldValue(values(), field)])))
  }
  return (
    <form class="contents" onSubmit={submit}>
      <Show when={props.spec.title}>{(title) => <p class={QUESTION}>{title()}</p>}</Show>
      <For each={fields()}>
        {(field) => (
          <Show
            when={field.type === 'select'}
            fallback={
              <label class="flex flex-col gap-1">
                <span class={FIELD_LABEL}>{field.label}</span>
                <input
                  class={INPUT}
                  type="text"
                  value={values()[field.name] ?? ''}
                  onInput={(e) => set(field.name, e.currentTarget.value)}
                />
              </label>
            }
          >
            <SelectField
              field={field}
              value={fieldValue(values(), field)}
              onSelect={(value) => set(field.name, value)}
            />
          </Show>
        )}
      </For>
      <div class={ACTIONS}>
        <Button type="submit" class={ACTION}>
          Submit
        </Button>
      </div>
    </form>
  )
}

function Pending(props: {spec: UiInput; onAnswer: (value: UiAnswerValue) => void}): JSX.Element {
  return (
    <Switch fallback={<Form spec={props.spec} onAnswer={props.onAnswer} />}>
      <Match when={props.spec.kind === 'choices'}>
        <Choices spec={props.spec} onAnswer={props.onAnswer} />
      </Match>
      <Match when={props.spec.kind === 'confirm'}>
        <Confirm spec={props.spec} onAnswer={props.onAnswer} />
      </Match>
      <Match when={props.spec.kind === 'diff'}>
        <Diff spec={props.spec} onAnswer={props.onAnswer} />
      </Match>
    </Switch>
  )
}

export function makeConcivUiCard(opts: {
  reply: (toolCallId: string, value: UiAnswerValue) => void
}): (props: ToolCardProps) => JSX.Element {
  return (props) => {
    const spec = () => parseUiInput(props.part.arguments)
    const outcome = () => parseUiOutput(props.part.output)
    const settled = () => outcome() !== null || props.part.state === 'complete' || props.part.state === 'error'
    return (
      <Show when={spec()}>
        {(input) => (
          <div class={CARD} data-tool="conciv_ui">
            <Show
              when={!settled()}
              fallback={
                <>
                  <Show when={input().question ?? input().title}>
                    {(question) => <p class={QUESTION}>{question()}</p>}
                  </Show>
                  <p class={SETTLED} role="status">
                    {outcome()?.answered === false ? (outcome()?.note ?? 'Not answered.') : 'Answered.'}
                  </p>
                </>
              }
            >
              <Pending spec={input()} onAnswer={(value) => props.part.id && opts.reply(props.part.id, value)} />
            </Show>
          </div>
        )}
      </Show>
    )
  }
}
