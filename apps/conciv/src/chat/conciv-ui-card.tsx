import {Show, For, createSignal, type JSX} from 'solid-js'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {UiAnswerSchema, UiInputSchema, type UiAnswerValue, type UiInput} from '@conciv/protocol/ui-types'

const CARD = 'self-stretch flex flex-col gap-2.5 p-3 border border-pw-line rounded-pw-md bg-pw-fill-soft anim-msg-lg'
const QUESTION = 'font-semibold text-pw-text'
const DETAIL =
  'p-2 rounded-[0.4375rem] bg-pw-sunken text-[0.6875rem] whitespace-pre-wrap [word-break:break-word] text-pw-text-2'
const ACTIONS = 'flex gap-2'
const ACTION_BASE =
  'flex-1 min-h-[2.375rem] py-[0.5625rem] px-3 border rounded-[0.5625rem] cursor-pointer font-semibold text-[0.8125rem] leading-none font-pw trans-btn active:scale-[0.97]'
const PRIMARY = `${ACTION_BASE} border-transparent bg-pw-accent text-pw-on-accent hover:bg-pw-accent-hi`
const GHOST = `${ACTION_BASE} bg-transparent border-pw-line-2 text-pw-text hover:border-pw-danger hover:text-pw-danger`
const INPUT =
  'py-2 px-2.5 border border-pw-line rounded-pw-sm bg-pw-fill text-pw-text [font:inherit] trans-border focus:outline-none focus:border-pw-accent'
const SETTLED = 'text-[0.75rem] text-pw-text-2'

export function parseUiInput(argumentsJson: string): UiInput | null {
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
            <button
              type="button"
              class="text-[0.8125rem] text-pw-text leading-none font-medium font-pw px-[0.8125rem] py-[0.5625rem] border border-pw-accent-line rounded-pw-pill bg-pw-accent-08 min-h-9 cursor-pointer trans-bg-tf hover:bg-pw-accent-20 active:scale-[0.97]"
              onClick={() => props.onAnswer(option)}
            >
              {option}
            </button>
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
      <Show when={props.spec.detail}>{(detail) => <pre class={DETAIL}>{detail()}</pre>}</Show>
      <div class={ACTIONS}>
        <button type="button" class={PRIMARY} onClick={() => props.onAnswer('yes')}>
          Approve
        </button>
        <button type="button" class={GHOST} onClick={() => props.onAnswer('no')}>
          Deny
        </button>
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
        <button type="button" class={PRIMARY} onClick={() => props.onAnswer('apply')}>
          Apply
        </button>
        <button type="button" class={GHOST} onClick={() => props.onAnswer('reject')}>
          Reject
        </button>
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
          <label class="flex flex-col gap-1">
            <span class="text-[0.75rem] text-pw-text-2">{field.label}</span>
            <Show
              when={field.type === 'select'}
              fallback={
                <input
                  class={INPUT}
                  type="text"
                  value={values()[field.name] ?? ''}
                  onInput={(e) => set(field.name, e.currentTarget.value)}
                />
              }
            >
              <select
                class={INPUT}
                value={fieldValue(values(), field)}
                onChange={(e) => set(field.name, e.currentTarget.value)}
              >
                <For each={field.options ?? []}>{(option) => <option value={option}>{option}</option>}</For>
              </select>
            </Show>
          </label>
        )}
      </For>
      <div class={ACTIONS}>
        <button type="submit" class={PRIMARY}>
          Submit
        </button>
      </div>
    </form>
  )
}

function Pending(props: {spec: UiInput; onAnswer: (value: UiAnswerValue) => void}): JSX.Element {
  const spec = props.spec
  if (spec.kind === 'choices') return <Choices spec={spec} onAnswer={props.onAnswer} />
  if (spec.kind === 'confirm') return <Confirm spec={spec} onAnswer={props.onAnswer} />
  if (spec.kind === 'diff') return <Diff spec={spec} onAnswer={props.onAnswer} />
  return <Form spec={spec} onAnswer={props.onAnswer} />
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
