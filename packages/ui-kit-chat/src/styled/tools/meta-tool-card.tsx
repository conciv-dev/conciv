import {For, Match, Show, Switch, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {ShieldAlert} from 'lucide-solid'
import {z} from 'zod'
import {SolidCodeBlock} from '@conciv/solid-diffs'
import type {ToolResultPart} from '@tanstack/ai-client'
import type {ToolCardProps, ToolViewError, ToolViewMeta} from '@conciv/protocol/tool-view-types'
import type {ElementCapture} from '@conciv/protocol/element-capture-types'
import {parseInput, parseResultPayload, resultText} from '../../primitives/tools/tool-util.js'
import {schemaFields} from '../../primitives/tools/schema-params.js'
import {toolStatus} from '../../primitives/tools/tool-status.js'
import {
  CODE_BLOCK_CLASS,
  CODE_BLOCK_OPTIONS,
  DANGER_TEXT_CLASS,
  MUTATING_BADGE,
  cardPhase,
  cardTitle,
  clip,
  displayValue,
  type CardPhase,
} from '../../primitives/tools/tool-presentation.js'
import {toolIconRender} from '../tool-icon.js'
import {ToolCard} from '../tool-card.js'
import {Chip, CHIP, ChipRow} from '../chip.js'
import {JsonTree} from '../json-tree.js'
import {ElementPreview} from '../element-preview.js'
import {MirrorRow, NoteRow} from './note-row.js'

const SUMMARY = 'text-[color:var(--chat-text-2)] text-[length:var(--chat-text-sm)] m-0'
const HINT = 'text-[color:var(--chat-text-3)] text-[length:var(--chat-text-xs)] m-0'

const CATEGORY_ACCENT: Record<string, string> = {
  read: 'inline-flex text-[color:var(--chat-accent-link)]',
  act: 'inline-flex text-[color:var(--chat-accent)]',
  'edit-live': 'inline-flex text-[color:var(--chat-success)]',
  react: 'inline-flex text-[color:var(--chat-text-hi)]',
}
const NEUTRAL_ACCENT = 'inline-flex text-[color:var(--chat-text-3)]'

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
  error: z.looseObject({message: z.string(), code: z.string().optional()}),
})

function payloadErrorMessage(payload: unknown, errors: readonly ToolViewError[] | undefined): string | undefined {
  const parsed = ErrorPayload.safeParse(payload)
  if (!parsed.success) return undefined
  const {message, code} = parsed.data.error
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
  return (
    <SolidCodeBlock
      class={CODE_BLOCK_CLASS}
      options={CODE_BLOCK_OPTIONS}
      file={{name: props.name, lang: 'text', contents: props.contents}}
    />
  )
}

function ResultView(props: {outputSchema: unknown; payload: unknown; raw: string}): JSX.Element {
  const view = () => resultViewOf(props.outputSchema)
  const list = () => (Array.isArray(props.payload) ? props.payload : undefined)
  return (
    <Switch fallback={<ResultBlock name="result.json" contents={props.raw} />}>
      <Match when={view() === 'list' && list()}>{(items) => <JsonTree data={items()} />}</Match>
      <Match when={view() === 'code'}>
        <ResultBlock name="result.txt" contents={props.raw} />
      </Match>
      <Match when={view() === 'chip'}>
        <code class={CHIP}>{props.raw}</code>
      </Match>
    </Switch>
  )
}

export function MetaToolCard(props: ToolCardProps): JSX.Element {
  const meta = (): ToolViewMeta | undefined => props.ctx.catalog.meta(props.part.name)
  const status = () => toolStatus(props.part, props.result)
  const input = (): Record<string, unknown> => parseInput(InputRecord, props.part) ?? {}
  const positionalValue = (): string | undefined => {
    const key = meta()?.positional
    if (key === undefined) return undefined
    const value = input()[key]
    return value === undefined ? undefined : clip(displayValue(value), 48)
  }
  const phase = (): CardPhase => cardPhase(status())
  const title = (): string => cardTitle(meta(), phase(), props.part.name)
  const headline = (): string => {
    const value = positionalValue()
    return value === undefined ? title() : `${title()} ${value}`
  }
  const chips = (): Array<{name: string; value: string}> => {
    const declared = meta()
    const values = input()
    const skip = declared?.positional
    const declaredOrder = schemaFields(declared?.inputSchema).map((field) => field.name)
    const extras = Object.keys(values).filter((name) => !declaredOrder.includes(name))
    return [...declaredOrder, ...extras]
      .filter((name) => name !== skip && values[name] !== undefined)
      .map((name) => ({name, value: clip(displayValue(values[name]))}))
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
  const Icon = (): JSX.Element => (
    <span class={accent()}>
      <Dynamic component={toolIconRender(meta()?.icon)} size={14} />
    </span>
  )
  return (
    <ToolCard
      Icon={Icon}
      title={headline()}
      titleTooltip={meta()?.summary}
      meta={meta()?.mutating === true ? MUTATING_BADGE : undefined}
      part={props.part}
      result={props.result}
      durationMs={props.durationMs}
    >
      <div class="flex flex-col gap-1.5">
        <Show when={capture()}>
          {(value) => (
            <ElementPreview.Root capture={value()} css={props.capture?.css}>
              <ElementPreview.Frame />
              <ElementPreview.Descriptor />
            </ElementPreview.Root>
          )}
        </Show>
        <Show when={meta()?.summary}>{(summary) => <p class={SUMMARY}>{summary()}</p>}</Show>
        <Show when={meta()?.hint}>{(hint) => <p class={HINT}>{hint()}</p>}</Show>
        <Show when={chips().length > 0}>
          <ChipRow>
            <For each={chips()}>{(chip) => <Chip name={chip.name} value={chip.value} />}</For>
          </ChipRow>
        </Show>
        <Show when={meta()?.approval === 'ask'}>
          <NoteRow icon={<ShieldAlert size={12} aria-hidden="true" />} tone="accent">
            asks before it runs
          </NoteRow>
        </Show>
        <Show when={meta()?.mirrors === true}>
          <MirrorRow />
        </Show>
        <Show when={errorMessage()}>{(message) => <p class={DANGER_TEXT_CLASS}>{message()}</p>}</Show>
        <Show when={errorMessage() === undefined && raw().length > 0}>
          <ResultView outputSchema={meta()?.outputSchema} payload={payload()} raw={raw()} />
        </Show>
      </div>
    </ToolCard>
  )
}
