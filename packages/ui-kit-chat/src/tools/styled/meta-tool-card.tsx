import {Match, Show, Switch, type JSX} from 'solid-js'
import ShieldAlert from 'lucide-solid/icons/shield-alert'
import {z} from 'zod'
import type {ToolResultPart} from '@tanstack/ai-client'
import type {ToolCardProps, ToolViewError} from '@conciv/protocol/tool-view-types'
import type {ElementCapture} from '@conciv/protocol/element-capture-types'
import {parseInput, parseResultPayload, resultText} from '../primitives/tool-util.js'
import {MUTATING_BADGE, clip, displayValue} from '../primitives/tool-presentation.js'
import {CardShell, cardHeader} from './card-shell.js'
import {useEmbeddedRowLine} from './card-chrome.js'
import {CHIP} from './chip.js'
import {JsonTree} from './json-tree.js'
import {ShapedValue} from './shaped-content.js'
import {ElementPreview} from './element-preview.js'
import {MirrorRow, NoteRow} from './note-row.js'
import {CodeBlock} from './code-block.js'
import {ErrorBlock} from './error-block.js'

const SUMMARY = 'text-chat-text-2 text-[length:var(--chat-text-sm)] m-0'
const HINT = 'text-chat-text-3 text-[length:var(--chat-text-xs)] m-0'

const CATEGORY_ACCENT: Record<string, string> = {
  read: 'inline-flex text-chat-accent-link',
  act: 'inline-flex text-chat-accent',
  'edit-live': 'inline-flex text-chat-success',
  react: 'inline-flex text-chat-text-hi',
}
const NEUTRAL_ACCENT = 'inline-flex text-chat-text-3'

const InputRecord = z.record(z.string(), z.unknown())

const SchemaRoot = z
  .object({type: z.string().optional(), items: z.object({type: z.string().optional()}).loose().optional()})
  .loose()

type ResultView = 'list' | 'code' | 'chip' | 'json'

function resultViewOf(outputSchema: unknown): ResultView {
  const parsed = SchemaRoot.safeParse(outputSchema)
  if (!parsed.success) return 'json'
  const root = parsed.data.type
  if (root === 'array') return parsed.data.items?.type === 'object' ? 'list' : 'json'
  if (root === 'string') return 'code'
  if (root === 'number' || root === 'integer' || root === 'boolean') return 'chip'
  return 'json'
}

const ErrorPayload = z.looseObject({
  error: z.union([z.string(), z.looseObject({message: z.string(), code: z.string().optional()})]),
})

const DECLARED_ERROR_PREFIX = /^([A-Z][A-Z0-9_]+): ([\s\S]*)$/

function declaredErrorParts(error: string | {message: string; code?: string}): {
  message: string
  code: string | undefined
} {
  if (typeof error !== 'string') return {message: error.message, code: error.code}
  const match = DECLARED_ERROR_PREFIX.exec(error)
  if (match === null) return {message: error, code: undefined}
  const [, code, message] = match
  return {message: message ?? error, code}
}

function payloadErrorMessage(payload: unknown, errors: readonly ToolViewError[] | undefined): string | undefined {
  const parsed = ErrorPayload.safeParse(payload)
  if (!parsed.success) return undefined
  const {message, code} = declaredErrorParts(parsed.data.error)
  const declared = code === undefined ? undefined : errors?.find((candidate) => candidate.code === code)
  return declared?.message ?? message
}

function failureText(
  result: ToolResultPart | undefined,
  errors: readonly ToolViewError[] | undefined,
): string | undefined {
  if (result?.state !== 'error') return undefined
  const structured = payloadErrorMessage(parseResultPayload(result), errors)
  if (structured !== undefined) return structured
  const direct = result.error
  if (typeof direct === 'string' && direct.length > 0) return direct
  const text = resultText(result)
  return text.length > 0 ? text : undefined
}

function ResultBlock(props: {contents: string; name: string}): JSX.Element {
  return <CodeBlock file={{name: props.name, lang: 'text', contents: props.contents}} />
}

function ResultView(props: {outputSchema: unknown; payload: unknown; raw: string}): JSX.Element {
  const view = () => resultViewOf(props.outputSchema)
  const list = () => (Array.isArray(props.payload) ? props.payload : undefined)
  const decoded = () => (typeof props.payload === 'string' ? props.payload : props.raw)
  return (
    <Switch fallback={<ShapedValue name="result" value={props.payload} />}>
      <Match when={view() === 'list' && list()}>{(items) => <JsonTree data={items()} />}</Match>
      <Match when={view() === 'code'}>
        <ResultBlock name="result.txt" contents={decoded()} />
      </Match>
      <Match when={view() === 'chip'}>
        <code class={CHIP}>{decoded()}</code>
      </Match>
    </Switch>
  )
}

export function MetaToolCard(props: ToolCardProps): JSX.Element {
  const {meta, title} = cardHeader(props)
  const input = (): Record<string, unknown> => parseInput(InputRecord, props.part) ?? {}
  const positionalValue = (): string | undefined => {
    const key = meta()?.positional
    if (key === undefined) return undefined
    const value = input()[key]
    return value === undefined ? undefined : clip(displayValue(value), 48)
  }
  const headline = (): string => {
    const value = positionalValue()
    return value === undefined ? title() : `${title()} ${value}`
  }
  const capture = (): ElementCapture | undefined => props.capture?.after ?? props.capture?.before
  const errorMessage = (): string | undefined => failureText(props.result, meta()?.errors)
  const raw = () => resultText(props.result)
  const payload = (): unknown => {
    const text = raw()
    if (!text) return undefined
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }
  const accent = () => CATEGORY_ACCENT[meta()?.category ?? ''] ?? NEUTRAL_ACCENT
  const rowLine = useEmbeddedRowLine()
  const bodySummary = () => {
    const summary = meta()?.summary
    if (summary === undefined || summary.length === 0) return undefined
    return rowLine().includes(summary) ? undefined : summary
  }
  return (
    <CardShell
      meta={meta()}
      title={headline()}
      metaBadge={meta()?.mutating === true ? MUTATING_BADGE : undefined}
      part={props.part}
      result={props.result}
      durationMs={props.durationMs}
      iconClass={accent()}
    >
      <Show when={capture()}>
        {(value) => (
          <ElementPreview.Root capture={value()} css={props.capture?.css}>
            <ElementPreview.Frame />
            <ElementPreview.Descriptor />
          </ElementPreview.Root>
        )}
      </Show>
      <Show when={bodySummary()}>{(summary) => <p class={SUMMARY}>{summary()}</p>}</Show>
      <Show when={meta()?.hint}>{(hint) => <p class={HINT}>{hint()}</p>}</Show>
      <Show when={meta()?.approval === 'ask'}>
        <NoteRow icon={<ShieldAlert size={12} aria-hidden="true" />} tone="accent">
          asks before it runs
        </NoteRow>
      </Show>
      <Show when={meta()?.mirrors === true}>
        <MirrorRow />
      </Show>
      <Show when={errorMessage()}>{(message) => <ErrorBlock message={message()} />}</Show>
      <Show when={errorMessage() === undefined && raw().length > 0}>
        <ResultView outputSchema={meta()?.outputSchema} payload={payload()} raw={raw()} />
      </Show>
    </CardShell>
  )
}
