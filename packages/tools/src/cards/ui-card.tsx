import {createMemo, createSignal, For, Match, Show, Switch, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import Check from 'lucide-solid/icons/check'
import ChevronDown from 'lucide-solid/icons/chevron-down'
import LayoutTemplate from 'lucide-solid/icons/layout-template'
import MessageCircleOff from 'lucide-solid/icons/message-circle-off'
import {Button, createListCollection, Select, TextField} from '@conciv/ui-kit-system'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {
  UiAnswerSchema,
  UiInputSchema,
  type UiAnswer,
  type UiAnswerValue,
  type UiFormField,
  type UiInput,
  type UiQuestion,
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
  ToolCard,
} from '@conciv/ui-kit-chat/tools'
const LABEL: Record<UiInput['kind'], string> = {
  choices: 'choices',
  confirm: 'a confirmation',
  diff: 'a diff',
  form: 'a form',
  questions: 'a question',
}

const BODY = 'flex flex-col gap-2.5 py-1'
const QUESTION = 'text-[length:var(--chat-text-md)] [color:var(--chat-text)] font-semibold m-0'
const SENT = 'text-[length:var(--chat-text-xs)] [color:var(--chat-text-3)] m-0'
const CHOICE = 'min-h-11 flex-auto'
const ACTION = 'min-h-11 flex-1'

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
    return Object.entries(answer.value).map(([name, value]) => [name, Array.isArray(value) ? value.join(', ') : value])
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
    <ActionRow>
      <For each={props.spec.options ?? []}>
        {(option) => (
          <Button variant="accent-soft" class={CHOICE} disabled={props.disabled} onClick={() => props.onAnswer(option)}>
            {option}
          </Button>
        )}
      </For>
    </ActionRow>
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

function selectedFor(answers: Record<string, string | string[]>, header: string): string[] {
  const value = answers[header]
  if (Array.isArray(value)) return value
  return typeof value === 'string' && value.length > 0 ? [value] : []
}

function toggledSelection(current: string[], label: string): string[] {
  return current.includes(label) ? current.filter((entry) => entry !== label) : [...current, label]
}

function QuestionBlock(props: {
  question: UiQuestion
  disabled: boolean
  answers: Record<string, string | string[]>
  otherText: Record<string, string>
  onToggle: (header: string, label: string) => void
  onOtherInput: (header: string, text: string) => void
}): JSX.Element {
  const selected = () => selectedFor(props.answers, props.question.header)
  return (
    <fieldset class="m-0 p-0 border-0 flex flex-col gap-1.5">
      <legend class={QUESTION}>{props.question.question}</legend>
      <ActionRow>
        <For each={props.question.options}>
          {(option) => (
            <Button
              variant="accent-soft"
              class={CHOICE}
              disabled={props.disabled}
              aria-pressed={selected().includes(option.label)}
              onClick={() => props.onToggle(props.question.header, option.label)}
            >
              {option.label}
              <Show when={option.description}>{(description) => <span class={SENT}>{description()}</span>}</Show>
            </Button>
          )}
        </For>
      </ActionRow>
      <TextField
        label="Other"
        disabled={props.disabled}
        value={props.otherText[props.question.header] ?? ''}
        onInput={(event) => props.onOtherInput(props.question.header, event.currentTarget.value)}
      />
    </fieldset>
  )
}

function questionAnswered(
  question: UiQuestion,
  answers: Record<string, string | string[]>,
  otherText: Record<string, string>,
): boolean {
  if ((otherText[question.header] ?? '').trim().length > 0) return true
  return selectedFor(answers, question.header).length > 0
}

function multiSelectAnswer(picked: string[], free: string): string[] | undefined {
  const combined = free ? [...picked, free] : picked
  if (combined.length === 0) return undefined
  return combined
}

function singleSelectAnswer(picked: string[], free: string): string | undefined {
  if (free) return free
  return picked[0]
}

function questionAnswerValue(
  question: UiQuestion,
  answers: Record<string, string | string[]>,
  otherText: Record<string, string>,
): string | string[] | undefined {
  const picked = selectedFor(answers, question.header)
  const free = (otherText[question.header] ?? '').trim()
  if (question.multiSelect) return multiSelectAnswer(picked, free)
  return singleSelectAnswer(picked, free)
}

function Questions(props: {spec: UiInput; disabled: boolean; onAnswer: (value: UiAnswerValue) => void}): JSX.Element {
  const questions = (): UiQuestion[] => props.spec.questions ?? []
  const [answers, setAnswers] = createStore<Record<string, string | string[]>>({})
  const [otherText, setOtherText] = createStore<Record<string, string>>({})
  const toggle = (header: string, label: string) => {
    const question = questions().find((entry) => entry.header === header)
    if (question?.multiSelect) {
      setAnswers(header, toggledSelection(selectedFor(answers, header), label))
      return
    }
    setAnswers(header, [label])
  }
  const complete = () => questions().every((question) => questionAnswered(question, answers, otherText))
  const submit = () => {
    const value: Record<string, string | string[]> = {}
    for (const question of questions()) {
      const answer = questionAnswerValue(question, answers, otherText)
      if (answer !== undefined) value[question.header] = answer
    }
    props.onAnswer(value)
  }
  return (
    <div class="flex flex-col gap-3">
      <For each={questions()}>
        {(question) => (
          <QuestionBlock
            question={question}
            disabled={props.disabled}
            answers={answers}
            otherText={otherText}
            onToggle={toggle}
            onOtherInput={(header, text) => setOtherText(header, text)}
          />
        )}
      </For>
      <ActionRow>
        <Button class={ACTION} disabled={props.disabled || !complete()} onClick={submit}>
          Submit
        </Button>
      </ActionRow>
    </div>
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
      <Match when={props.spec.kind === 'questions'}>
        <Questions spec={props.spec} disabled={props.disabled} onAnswer={props.onAnswer} />
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
  const dismiss = () => {
    setSent(true)
    props.ctx.dismissUi?.(props.part.id)
  }
  return (
    <ToolCard Icon={Icon} title={title(input()?.kind)} part={props.part} result={props.result} defaultOpen>
      <div class={BODY}>
        <Show when={question()}>{(text) => <p class={QUESTION}>{text()}</p>}</Show>
        <Show when={!settled()} fallback={<Answered answer={answer()} />}>
          <Show when={input()} fallback={<p class={SENT}>waiting for the form</p>}>
            {(spec) => <Pending spec={spec()} disabled={sent()} onAnswer={answerWith} />}
          </Show>
          <Show when={input()?.kind === 'questions'}>
            <ActionRow>
              <Button variant="outline-danger" class={ACTION} disabled={sent()} onClick={dismiss}>
                Dismiss
              </Button>
            </ActionRow>
          </Show>
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
