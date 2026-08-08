import {For, Match, Show, Switch, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {MoveUpRight, ShieldAlert} from 'lucide-solid'
import {z} from 'zod'
import {SolidCodeBlock, type FileOptions} from '@conciv/solid-diffs'
import type {ToolResultPart} from '@tanstack/ai-client'
import type {ToolCardProps, ToolViewError, ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {parseInput, resultText} from '../../primitives/tools/tool-util.js'
import {schemaFields} from '../../primitives/tools/schema-params.js'
import {toolStatus} from '../../primitives/tools/tool-status.js'
import {toolIconRender} from '../tool-icon.js'
import {ToolCard} from '../tool-card.js'

const CODE_OPTIONS: FileOptions<undefined> = {
  theme: {light: 'github-light', dark: 'github-dark'},
  themeType: 'system',
  disableFileHeader: true,
  disableLineNumbers: true,
  overflow: 'wrap',
}
const CODE_CLASS =
  'block w-full max-h-[13.75rem] overflow-auto rounded-[var(--chat-radius-sm)] text-[length:var(--chat-text-xs)] [background:var(--chat-sunken)] [border:1px_solid_var(--chat-line-soft)]'
const CHIP =
  'inline-flex items-center gap-1.25 max-w-full min-w-0 [font-family:var(--chat-mono)] text-[length:var(--chat-text-xs)] [color:var(--chat-accent-link)] [background:color-mix(in_oklch,var(--chat-accent)_10%,transparent)] [border:1px_solid_color-mix(in_oklch,var(--chat-accent)_42%,transparent)] rounded-[var(--chat-radius-pill)] py-0.5 px-2.25'
const CHIP_KEY = 'text-[color:var(--chat-text-3)]'
const CHIP_VALUE = 'whitespace-nowrap text-ellipsis overflow-hidden [color:var(--chat-text)]'
const SUMMARY = 'text-[color:var(--chat-text-2)] text-[length:var(--chat-text-sm)] m-0'
const HINT = 'text-[color:var(--chat-text-3)] text-[length:var(--chat-text-xs)] m-0'
const ROW = 'text-[length:var(--chat-text-xs)] flex gap-1.5 items-center'
const MIRROR_ROW = `${ROW} [color:var(--chat-accent-link)]`
const APPROVAL_ROW = `${ROW} [color:var(--chat-accent)]`
const DANGER =
  'text-[length:var(--chat-text-sm)] whitespace-pre-wrap [color:var(--chat-danger)] [font-family:var(--chat-mono)] m-0'
const LIST =
  'm-0 p-0 list-none rounded-[var(--chat-radius-sm)] max-h-[13.75rem] w-full [background:var(--chat-sunken)] [border:1px_solid_var(--chat-line-soft)] overflow-auto'
const LIST_ITEM =
  'text-[length:var(--chat-text-xs)] px-2.5 py-1 flex flex-wrap gap-2 items-baseline [&:not(:first-child)]:[border-top:1px_solid_var(--chat-line-soft)]'

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

function displayValue(value: unknown): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value) ?? String(value)
}

function clip(value: string, max = 64): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function declaredMessage(raw: string, errors: readonly ToolViewError[] | undefined): string {
  if (errors === undefined) return raw
  const code = raw.split(':')[0]?.trim() ?? ''
  const declared = errors.find((candidate) => candidate.code === code)
  return declared?.message ?? raw
}

function failureText(result: ToolResultPart | undefined): string | undefined {
  if (result?.state !== 'error') return undefined
  const direct = result.error
  if (typeof direct === 'string' && direct.length > 0) return direct
  const text = resultText(result)
  return text.length > 0 ? text : undefined
}

function objectRows(item: unknown): Array<[string, unknown]> {
  const parsed = InputRecord.safeParse(item)
  return parsed.success ? Object.entries(parsed.data) : []
}

function ResultList(props: {items: readonly unknown[]}): JSX.Element {
  return (
    <ul class={LIST}>
      <For each={props.items}>
        {(item) => (
          <li class={LIST_ITEM}>
            <For each={objectRows(item)}>
              {([key, value]) => (
                <span class={CHIP}>
                  <span class={CHIP_KEY}>{key}</span>
                  <span class={CHIP_VALUE}>{clip(displayValue(value))}</span>
                </span>
              )}
            </For>
          </li>
        )}
      </For>
    </ul>
  )
}

function ResultBlock(props: {contents: string; name: string}): JSX.Element {
  return (
    <SolidCodeBlock
      class={CODE_CLASS}
      options={CODE_OPTIONS}
      file={{name: props.name, lang: 'text', contents: props.contents}}
    />
  )
}

function ResultView(props: {outputSchema: unknown; payload: unknown; raw: string}): JSX.Element {
  const view = () => resultViewOf(props.outputSchema)
  const list = () => (Array.isArray(props.payload) ? props.payload : undefined)
  return (
    <Switch fallback={<ResultBlock name="result.json" contents={props.raw} />}>
      <Match when={view() === 'list' && list()}>{(items) => <ResultList items={items()} />}</Match>
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
  const phase = (): 'running' | 'done' => (status() === 'complete' || status() === 'error' ? 'done' : 'running')
  const title = (): string => {
    const declared = meta()
    const label = declared?.label?.[phase()]
    return label || declared?.summary || props.part.name
  }
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
  const errorMessage = (): string | undefined => {
    const raw = failureText(props.result)
    return raw === undefined ? undefined : declaredMessage(raw, meta()?.errors)
  }
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
      meta={meta()?.mutating === true ? 'writes' : undefined}
      part={props.part}
      result={props.result}
      durationMs={props.durationMs}
    >
      <div class="flex flex-col gap-1.5">
        <Show when={meta()?.summary}>{(summary) => <p class={SUMMARY}>{summary()}</p>}</Show>
        <Show when={meta()?.hint}>{(hint) => <p class={HINT}>{hint()}</p>}</Show>
        <Show when={chips().length > 0}>
          <div class="flex flex-wrap gap-1.5">
            <For each={chips()}>
              {(chip) => (
                <span class={CHIP}>
                  <span class={CHIP_KEY}>{chip.name}</span>
                  <span class={CHIP_VALUE}>{chip.value}</span>
                </span>
              )}
            </For>
          </div>
        </Show>
        <Show when={meta()?.approval === 'ask'}>
          <div class={APPROVAL_ROW}>
            <ShieldAlert size={12} aria-hidden="true" />
            <span>asks before it runs</span>
          </div>
        </Show>
        <Show when={meta()?.mirrors === true}>
          <div class={MIRROR_ROW}>
            <MoveUpRight size={12} aria-hidden="true" />
            <span>shown on your page</span>
          </div>
        </Show>
        <Show when={errorMessage()}>{(message) => <p class={DANGER}>{message()}</p>}</Show>
        <Show when={errorMessage() === undefined && raw().length > 0}>
          <ResultView outputSchema={meta()?.outputSchema} payload={payload()} raw={raw()} />
        </Show>
      </div>
    </ToolCard>
  )
}
