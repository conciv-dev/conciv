import {z} from 'zod'
import {lowerCase} from 'es-toolkit'
import {For, Show, splitProps, type JSX} from 'solid-js'
import {usePlugin} from '@conciv/plugin/experimental'
import {OpaqueUi, type CardChip, type InternalUi, type ToolProps} from '@internal/plugin'
import type {ToolCallPart, ToolResultPart} from '@conciv/protocol/chat-message-types'
import Clock from 'lucide-solid/icons/clock'
import Code from 'lucide-solid/icons/code'
import Component from 'lucide-solid/icons/component'
import Keyboard from 'lucide-solid/icons/keyboard'
import MousePointerClick from 'lucide-solid/icons/mouse-pointer-click'
import ScanSearch from 'lucide-solid/icons/scan-search'
import Wand2 from 'lucide-solid/icons/wand-sparkles'
import {Operations, PAGE_TOOL_PREFIX, pageVerbOfTool, type Method} from '@conciv/plugin-page/rpc'

const MUTATING_BADGE = 'page edit'

export function usePageUi(): InternalUi {
  return OpaqueUi.toInternal(usePlugin().ui)
}

type StepView = {
  readonly icon: (props: {size: number}) => JSX.Element
  readonly label: {readonly running: string; readonly done: string}
}

const STEP_VIEWS: Readonly<Record<Method, StepView>> = {
  'tabs.list': {icon: ScanSearch, label: {running: 'Listing the tabs', done: 'Listed the tabs'}},
  route: {icon: ScanSearch, label: {running: 'Reading the route', done: 'Read the route'}},
  dom: {icon: ScanSearch, label: {running: 'Reading the DOM', done: 'Read the DOM'}},
  query: {icon: ScanSearch, label: {running: 'Querying the page', done: 'Queried the page'}},
  console: {icon: ScanSearch, label: {running: 'Reading the console', done: 'Read the console'}},
  text: {icon: ScanSearch, label: {running: 'Reading text', done: 'Read the text'}},
  value: {icon: ScanSearch, label: {running: 'Reading a value', done: 'Read a value'}},
  attr: {icon: ScanSearch, label: {running: 'Reading an attribute', done: 'Read an attribute'}},
  exists: {icon: ScanSearch, label: {running: 'Checking existence', done: 'Checked existence'}},
  snapshot: {icon: ScanSearch, label: {running: 'Capturing a snapshot', done: 'Captured a snapshot'}},
  screenshot: {icon: ScanSearch, label: {running: 'Taking a screenshot', done: 'Took a screenshot'}},
  hmr: {icon: Clock, label: {running: 'Waiting for the hot update', done: 'Waited for the hot update'}},
  locate: {icon: Component, label: {running: 'Locating the source', done: 'Located the source'}},
  tree: {icon: Component, label: {running: 'Reading the page tree', done: 'Read the page tree'}},
  inspect: {icon: Component, label: {running: 'Inspecting a component', done: 'Inspected a component'}},
  override: {icon: Wand2, label: {running: 'Overriding a value', done: 'Overrode a value'}},
  find: {icon: Component, label: {running: 'Finding components', done: 'Found components'}},
  track: {icon: Component, label: {running: 'Tracking renders', done: 'Tracked renders'}},
  effect: {icon: Wand2, label: {running: 'Driving an effect', done: 'Drove an effect'}},
  wait: {icon: Clock, label: {running: 'Waiting for the page', done: 'Waited for the page'}},
  reload: {icon: Clock, label: {running: 'Reloading the page', done: 'Reloaded the page'}},
  click: {icon: MousePointerClick, label: {running: 'Clicking', done: 'Clicked'}},
  fill: {icon: Keyboard, label: {running: 'Typing', done: 'Typed'}},
  fill_form: {icon: Keyboard, label: {running: 'Filling the form', done: 'Filled the form'}},
  select: {icon: MousePointerClick, label: {running: 'Selecting an option', done: 'Selected'}},
  check: {icon: MousePointerClick, label: {running: 'Checking a box', done: 'Checked a box'}},
  uncheck: {icon: MousePointerClick, label: {running: 'Unchecking a box', done: 'Unchecked a box'}},
  press: {icon: Keyboard, label: {running: 'Pressing a key', done: 'Pressed'}},
  hover: {icon: MousePointerClick, label: {running: 'Hovering', done: 'Hovered'}},
  scroll: {icon: MousePointerClick, label: {running: 'Scrolling', done: 'Scrolled'}},
  submit: {icon: MousePointerClick, label: {running: 'Submitting the form', done: 'Submitted the form'}},
  queue: {icon: MousePointerClick, label: {running: 'Playing page actions', done: 'Played page actions'}},
  queue_async: {icon: MousePointerClick, label: {running: 'Queueing page actions', done: 'Queued page actions'}},
  setattr: {icon: Wand2, label: {running: 'Setting an attribute', done: 'Set an attribute'}},
  removeattr: {icon: Wand2, label: {running: 'Removing an attribute', done: 'Removed an attribute'}},
  addclass: {icon: Wand2, label: {running: 'Adding a class', done: 'Added a class'}},
  removeclass: {icon: Wand2, label: {running: 'Removing a class', done: 'Removed a class'}},
  setstyle: {icon: Wand2, label: {running: 'Styling an element', done: 'Styled an element'}},
  settext: {icon: Wand2, label: {running: 'Setting text', done: 'Set the text'}},
  sethtml: {icon: Wand2, label: {running: 'Setting HTML', done: 'Set the HTML'}},
  remove: {icon: Wand2, label: {running: 'Removing an element', done: 'Removed an element'}},
  insert: {icon: Wand2, label: {running: 'Inserting content', done: 'Inserted content'}},
  css: {icon: Wand2, label: {running: 'Injecting CSS', done: 'Injected CSS'}},
  eval: {icon: Code, label: {running: 'Running a script', done: 'Ran a script'}},
}

function readStepView(tool: string): StepView | undefined {
  const operation = Operations.find((candidate) => `${PAGE_TOOL_PREFIX}${candidate.name}` === tool)
  return operation === undefined ? undefined : STEP_VIEWS[operation.name]
}

export function pageStepView(verb: string): StepView | undefined {
  return readStepView(`${PAGE_TOOL_PREFIX}${verb}`)
}

export function pageVerbGerund(verb: string): string {
  const word = pageStepView(verb)?.label.running.split(' ')[0] ?? ''
  return word.length > 0 ? word : verb
}

function pageToolMutating(tool: string): boolean {
  return Operations.some((operation) => `${PAGE_TOOL_PREFIX}${operation.name}` === tool && operation.mutating)
}

export const ELEMENT_TARGET_KEYS = new Set(['selector', 'ref', 'name'])

export const QUIET_TEXT_CLASS = 'text-[length:var(--chat-text-xs)] m-0 text-chat-text-3'

export const LIST_ROW_CLASS =
  'px-2.5 py-1 flex gap-2 items-baseline [&:not(:first-child)]:[border-top:1px_solid_var(--chat-line-soft)]'

const COUNT_FORMAT = new Intl.NumberFormat()
const COUNT_PLURAL = new Intl.PluralRules('en')

export function countLabel(count: number, one: string, other: string): string {
  return `${COUNT_FORMAT.format(count)} ${COUNT_PLURAL.select(count) === 'one' ? one : other}`
}

const InputRecord = z.record(z.string(), z.unknown())

export function toolInput(ui: InternalUi, part: ToolCallPart): Record<string, unknown> {
  return ui.parseInput(InputRecord, part) ?? {}
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function outputPayload(output: string | undefined): unknown {
  if (!output) return undefined
  try {
    return JSON.parse(output)
  } catch {
    return undefined
  }
}

const ImagePartSchema = z
  .object({
    type: z.literal('image'),
    source: z.object({type: z.literal('data'), value: z.string(), mimeType: z.string()}).loose(),
  })
  .loose()

export function outputImageUrl(output: string | undefined): string | undefined {
  const raw = outputPayload(output)
  if (!Array.isArray(raw)) return undefined
  const image = raw.map((part) => ImagePartSchema.safeParse(part)).find((parsed) => parsed.success)?.data
  return image === undefined ? undefined : `data:${image.source.mimeType};base64,${image.source.value}`
}

export function outputChips(ui: InternalUi, output: string | undefined): Array<CardChip> {
  const payload = outputPayload(output)
  if (!isPlainRecord(payload)) return []
  return Object.entries(payload)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ({name, value: ui.clip(ui.displayValue(value))}))
}

export function ChipRow(props: {chips: ReadonlyArray<CardChip>}): JSX.Element {
  const ui = usePageUi()
  return (
    <Show when={props.chips.length > 0}>
      <ui.ChipRow>
        <For each={props.chips}>{(chip) => <ui.KitChip name={chip.name} value={chip.value} />}</For>
      </ui.ChipRow>
    </Show>
  )
}

export function mutatingBadge(mutating: boolean): string | undefined {
  return mutating ? MUTATING_BADGE : undefined
}

export function elementTarget(input: Record<string, unknown>): string | undefined {
  const selector = input.selector
  const ref = input.ref
  const name = input.name
  if (typeof selector === 'string' && selector.length > 0) return selector
  if (typeof ref === 'string' && ref.length > 0) return ref
  if (typeof name === 'string' && name.length > 0) return name
  return undefined
}

const NO_SKIP: ReadonlySet<string> = new Set()

function inputArgs(ui: InternalUi, input: Record<string, unknown>, skip: ReadonlySet<string>): string[] {
  return Object.entries(input)
    .filter(([name, value]) => !skip.has(name) && value !== undefined)
    .map(([name, value]) => `${name}=${ui.clip(ui.displayValue(value))}`)
}

export function pageTitle(tool: string, running: boolean): string {
  const label = readStepView(tool)?.label
  if (label === undefined) return tool
  return running ? label.running : label.done
}

export function PageTool(
  props: ToolProps & {
    subtitle?: string
    skip?: ReadonlySet<string>
    failed?: boolean
    hasContent: boolean
    children?: JSX.Element
  },
): JSX.Element {
  const ui = usePageUi()
  const [local, tool] = splitProps(props, ['subtitle', 'skip', 'failed', 'hasContent', 'children'])
  const running = () => tool.status === 'pending' || tool.status === 'running' || tool.status === 'streaming'
  const args = () => {
    const badge = mutatingBadge(pageToolMutating(tool.tool))
    const values = inputArgs(ui, tool.input, local.skip ?? NO_SKIP)
    return badge === undefined ? values : [...values, badge]
  }
  return (
    <ui.BasicTool
      {...tool}
      icon="app-window"
      failed={local.failed === true}
      title={pageTitle(tool.tool, running())}
      subtitle={local.subtitle}
      args={args()}
      expandable={!running() && local.hasContent}
    >
      {local.children}
    </ui.BasicTool>
  )
}

export function cardErrorMessage(ui: InternalUi, result: ToolResultPart | undefined): string | undefined {
  if (result?.state !== 'error') return undefined
  const direct = result.error
  if (typeof direct === 'string' && direct.length > 0) return direct
  const text = ui.resultText(result)
  return text.length > 0 ? text : undefined
}

export function PageFailedTool(props: ToolProps): JSX.Element {
  const ui = usePageUi()
  return (
    <ui.ToolErrorCard
      tool={props.tool}
      error={props.error ?? ''}
      title={`Page ${lowerCase(pageVerbOfTool(props.tool))}`}
      defaultOpen={props.defaultOpen}
      open={props.open}
      onOpenChange={props.onOpenChange}
    />
  )
}
