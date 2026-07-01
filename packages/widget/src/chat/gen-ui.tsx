import {createSignal, For, Show, type JSX} from 'solid-js'
import type {UiChoices, UiConfirm, UiDiff, UiForm, UiSpec} from '@conciv/protocol/ui-types'

// Agent-generated UI rendered inline in the chat thread; the user's answer becomes the next
// chat message (the resume turn cycle is the round-trip). Types come from @conciv/protocol.

// Shared chrome composed as utility strings (not CSS classes) so the shapes stay reusable.
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

function Choices(props: {spec: UiChoices; onAnswer: (text: string) => void}): JSX.Element {
  return (
    <div class={CARD}>
      <p class={QUESTION}>{props.spec.question}</p>
      <div class="flex flex-wrap gap-2">
        <For each={props.spec.options}>
          {(option) => (
            <button
              class="text-[0.8125rem] text-pw-text leading-none font-medium font-pw px-[0.8125rem] py-[0.5625rem] border border-pw-accent-line rounded-pw-pill bg-pw-accent-08 min-h-9 cursor-pointer trans-bg-tf hover:bg-pw-accent-20 active:scale-[0.97]"
              onClick={() => props.onAnswer(option)}
            >
              {option}
            </button>
          )}
        </For>
      </div>
    </div>
  )
}

function Confirm(props: {spec: UiConfirm; onAnswer: (text: string) => void}): JSX.Element {
  return (
    <div class={CARD}>
      <p class={QUESTION}>{props.spec.question}</p>
      <Show when={props.spec.detail}>{(detail) => <pre class={DETAIL}>{detail()}</pre>}</Show>
      <div class={ACTIONS}>
        <button class={PRIMARY} onClick={() => props.onAnswer('Yes, go ahead.')}>
          Approve
        </button>
        <button class={GHOST} onClick={() => props.onAnswer("No, don't.")}>
          Deny
        </button>
      </div>
    </div>
  )
}

function splitLines(text: string): string[] {
  return text.length === 0 ? [] : text.split('\n')
}

function Diff(props: {spec: UiDiff; onAnswer: (text: string) => void}): JSX.Element {
  return (
    <div class={CARD}>
      <div class="text-[0.75rem] text-pw-text-2 font-pw-mono">{props.spec.file}</div>
      <div class="text-[0.71875rem] leading-[1.5] font-pw-mono p-2 rounded-[0.4375rem] bg-pw-sunken overflow-x-auto">
        <For each={splitLines(props.spec.before)}>
          {(line) => <div class="text-pw-danger whitespace-pre">- {line}</div>}
        </For>
        <For each={splitLines(props.spec.after)}>
          {(line) => <div class="text-pw-success whitespace-pre">+ {line}</div>}
        </For>
      </div>
      <div class={ACTIONS}>
        <button class={PRIMARY} onClick={() => props.onAnswer(`Apply the change to ${props.spec.file}.`)}>
          Apply
        </button>
        <button class={GHOST} onClick={() => props.onAnswer('Reject that change.')}>
          Reject
        </button>
      </div>
    </div>
  )
}

function fieldValue(values: Record<string, string>, field: UiForm['fields'][number]): string {
  const current = values[field.name]
  if (current !== undefined) return current
  if (field.type === 'select') return field.options?.[0] ?? ''
  return ''
}

function Form(props: {spec: UiForm; onAnswer: (text: string) => void}): JSX.Element {
  const [values, setValues] = createSignal<Record<string, string>>({})
  const set = (name: string, value: string) => setValues((prev) => ({...prev, [name]: value}))
  const submit = (e: Event) => {
    e.preventDefault()
    const summary = props.spec.fields.map((f) => `${f.label}: ${fieldValue(values(), f)}`).join(', ')
    props.onAnswer(summary)
  }
  return (
    <form class={CARD} onSubmit={submit}>
      <Show when={props.spec.title}>{(title) => <p class={QUESTION}>{title()}</p>}</Show>
      <For each={props.spec.fields}>
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

// Dispatch a spec to its component; the if-chain narrows the discriminated union by `kind`.
export function GenUi(props: {spec: UiSpec; onAnswer: (text: string) => void}): JSX.Element | null {
  const spec = props.spec
  if (spec.kind === 'choices') return <Choices spec={spec} onAnswer={props.onAnswer} />
  if (spec.kind === 'confirm') return <Confirm spec={spec} onAnswer={props.onAnswer} />
  if (spec.kind === 'diff') return <Diff spec={spec} onAnswer={props.onAnswer} />
  if (spec.kind === 'form') return <Form spec={spec} onAnswer={props.onAnswer} />
  return null
}
