import {createMemo, For, Match, onCleanup, onMount, Show, splitProps, Switch, type JSX} from 'solid-js'
import {partition} from 'es-toolkit'
import {useFilter} from '@ark-ui/solid/locale'
import {
  Button,
  Collapsible,
  createListCollection,
  Dialog,
  LIST_PANEL_GROUP_LABEL,
  Listbox,
  Popover,
  SegmentGroup,
} from '@conciv/ui-kit-system'
import RotateCw from 'lucide-solid/icons/rotate-cw'
import Check from 'lucide-solid/icons/check'
import ChevronRight from 'lucide-solid/icons/chevron-right'
import ChevronsUpDown from 'lucide-solid/icons/chevrons-up-down'
import Search from 'lucide-solid/icons/search'
import {
  ReasoningEffortSchema,
  type ChatModels,
  type HarnessMenuEntry,
  type ReasoningEffort,
} from '@conciv/protocol/chat-types'
import type {ChatMessage} from '@conciv/protocol/chat-message-types'
import {
  effortLevels,
  harnessSection,
  historyTokensLabel,
  listedEffort,
  loginMessage,
  menuEntry,
  modelLabel,
  moreModelsLabel,
  promptName,
  rowValue,
  searchedSection,
  withOwnEntry,
  type HarnessSection,
  type ModelMenu,
  type ModelMenuRow,
  type ModelSwitchTarget,
  type OlderModelGroup,
} from '../primitives/model-selector/model-menu.js'

const MODEL_SELECTOR_TRIGGER =
  'text-chat-sm font-chat [color:var(--chat-text-2)] pl-2.5 pr-[0.4375rem] py-1 max-w-42 min-w-0 shrink gap-1 inline-flex items-center cursor-pointer rounded-[var(--chat-radius-pill)] [background:var(--chat-fill)] [border:1px_solid_var(--chat-line)] [transition:color_120ms_var(--chat-ease),border-color_120ms_var(--chat-ease),background-color_120ms_var(--chat-ease)] motion-reduce:transition-none hover:[color:var(--chat-text-hi)] hover:[background:var(--chat-fill-strong)]'

const MODELS_UNAVAILABLE = 'Couldn’t load models'
const MODELS_LOADING = 'Loading models'
const RETRY_LABEL = 'Retry loading models'
const SWITCH_FAILED = 'Could not switch model'
const EFFORT_SWITCH_FAILED = 'Could not switch effort'
const MENU_LABEL = 'Model'
const SEARCH_LABEL = 'Search models'
const PILL_LABEL = 'Select model'
const PILL_LOADING = 'Models…'
const PILL_FAILED = 'Models'
const PILL_EMPTY = 'No models'
const EFFORT_LABEL = 'Effort'
const EFFORT_HINT = '←→ to adjust'
const EFFORT_NAME: Record<ReasoningEffort, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'High+',
  max: 'Max',
}
const EFFORT_NOTE: Record<ReasoningEffort, string> = {
  low: 'Quick answers. Fastest, uses the fewest tokens.',
  medium: 'Balanced speed and depth for everyday work.',
  high: 'Thinks longer on hard problems. Slower, uses more tokens.',
  xhigh: 'Thinks even longer than High. Slower again, uses more tokens.',
  max: 'Thinks as long as it needs. Slowest, uses the most tokens.',
}
const EFFORT_DEFAULT_NOTE = 'Using the model’s default effort.'
const EFFORT_DEFAULT = 'default'
const EFFORT_DEFAULT_NAME = 'Default'

const PROMPT_FONT = '[font-family:var(--chat-mono)] text-[13px] leading-[1.45]'
const PROMPT_SLOT = 'flex-none flex items-center gap-1.5 min-h-7 select-none'
const PROMPT = `inline-flex items-center gap-1 min-h-7 overflow-hidden -ms-1.5 px-1.5 rounded-chat-sm focus-ring trans-bg hover:bg-chat-fill-strong data-[state=open]:bg-chat-fill-strong ${PROMPT_FONT}`
const PROMPT_MODEL = 'max-w-[32ch] truncate text-chat-text-3 anim-word-in tracking-[-0.04em] [word-spacing:-0.3em]'
const PROMPT_GLYPH = 'text-chat-accent'
const PILL_NAME = 'min-w-0 truncate'
const PILL_STACK = 'grid grid-cols-1 min-w-0'
const PILL_LAYER = 'col-start-1 row-start-1 inline-flex items-center gap-1 min-w-0'
const PILL_GHOST = `${PILL_LAYER} invisible`
const PILL_GHOST_NAME = `${PILL_NAME} before:content-[attr(data-label)]`
const PILL_STATES = [PILL_LOADING, PILL_FAILED, PILL_EMPTY]
const FAILED_ICON = 'text-chat-text-3 shrink-0 size-3.5 block'
const BARS = 'inline-flex items-end gap-[2px] h-[0.75em]'
const BAR =
  'w-[2px] rounded-[1px] [transition:background-color_160ms_var(--chat-ease)_var(--bar-delay)] motion-reduce:[transition:none]'
const BAR_STEP_MS = 45
const BAR_ON = `${BAR} bg-chat-text-3`
const BAR_OFF = `${BAR} bg-chat-line-2`
const CONTENT = 'w-80 max-w-[var(--available-width)] p-1 font-chat'
const SEARCH_ROW = 'flex items-center gap-2 px-2.5 pb-1 mb-1 border-b border-b-chat-line-soft text-chat-text-3'
const SEARCH_INPUT =
  'flex-1 min-w-0 h-8 bg-transparent [border:none] text-[0.8125rem] text-chat-text placeholder:text-chat-text-3 focus:outline-none'
const LIST = 'max-h-80 overflow-y-auto overscroll-contain'
const GROUP_TRIGGER =
  'group flex w-full items-center gap-3 py-2 px-2.5 rounded-chat-surface-sm [border:none] bg-transparent text-start cursor-pointer select-none focus-ring trans-bg hover:bg-chat-fill'
const GROUP_CHEVRON =
  'size-4 block text-chat-text-3 [transition:rotate_200ms_var(--chat-ease-expo)] group-data-[state=open]:rotate-90 motion-reduce:[transition:none]'
const RETRY =
  'flex w-full items-center gap-3 py-2 px-2.5 rounded-chat-surface-sm text-chat-body text-chat-text-hi focus-ring trans-bg hover:bg-chat-fill'
const RETRY_TEXT = 'flex-1 min-w-0 truncate text-start'
const MESSAGE = 'm-0 py-2 px-2.5 text-[0.75rem] text-chat-text-2'
const ROW_BODY = 'flex flex-col flex-1 min-w-0'
const ROW_NAME = 'block truncate text-[0.875rem] text-chat-text-hi'
const ROW_DESCRIPTION = 'block truncate text-[0.75rem] text-chat-text-2'
const ROW_END = 'size-4 shrink-0 grid place-items-center text-chat-text-hi'
const SEPARATOR = 'mx-1.5 my-1 h-px bg-chat-line'
const EFFORT = 'flex flex-col px-1.5 pt-1.5 pb-2'
const EFFORT_HEAD = 'flex items-baseline justify-between mb-2'
const EFFORT_TITLE = 'text-[0.75rem] font-medium text-chat-text-hi'
const EFFORT_HINT_TEXT = 'text-[0.6875rem] text-chat-text-3 [@media(hover:none)]:hidden'
const EFFORT_TRACK = 'flex w-full'
const EFFORT_SEGMENT = 'flex-1 basis-0 min-w-0 text-[0.75rem]'
const EFFORT_NOTE_BOX = 'mt-2 h-8'
const EFFORT_NOTE_TEXT = 'text-[0.75rem] leading-4 text-chat-text-2'

type Announce = (message: string, assertive?: boolean) => void

export type HarnessModelSelectorProps = {
  appearance?: 'prompt' | 'pill'
  menu: ModelMenu
  status: 'loading' | 'failed' | 'ready'
  models: ChatModels | undefined
  others?: {harnesses: readonly HarnessMenuEntry[]; failed: boolean; retry: () => void}
  value: string | null
  effort?: ReasoningEffort | null
  disabled?: boolean
  switchBlocked?: boolean
  history?: readonly ChatMessage[]
  announce?: Announce
  registerLayer?: (isOpen: () => boolean, hides?: boolean) => () => void
  onRetry: () => void
  onModelChange: (model: string) => Promise<unknown> | void
  onEffortChange?: (effort: ReasoningEffort | null) => Promise<unknown>
  onSwitchHarness?: (target: ModelSwitchTarget) => Promise<unknown>
}

function effortNote(effort: ReasoningEffort | null): string {
  return effort === null ? EFFORT_DEFAULT_NOTE : EFFORT_NOTE[effort]
}

function promptAriaLabel(name: string, effort: ReasoningEffort | null): string {
  const label = `${MENU_LABEL}: ${name}`
  return effort === null ? label : `${label}, effort ${EFFORT_NAME[effort]}`
}

function FailedMark(props: {announce: Announce | undefined}): JSX.Element {
  onMount(() => props.announce?.(MODELS_UNAVAILABLE))
  return <RotateCw class={FAILED_ICON} aria-hidden="true" />
}

function PillGhost(props: {label: string}): JSX.Element {
  return (
    <span class={PILL_GHOST} aria-hidden="true">
      <Show when={props.label === PILL_FAILED}>
        <RotateCw class={FAILED_ICON} aria-hidden="true" />
      </Show>
      <span class={PILL_GHOST_NAME} data-label={props.label} />
    </span>
  )
}

function RetryRow(props: {reason: string; onRetry: () => void}): JSX.Element {
  return (
    <>
      <p class={MESSAGE}>{props.reason}</p>
      <Button
        variant="plain"
        size="none"
        class={RETRY}
        aria-label={`${props.reason}: ${RETRY_LABEL}`}
        onClick={props.onRetry}
      >
        <RotateCw class="text-chat-text-3 shrink-0 size-4 block" aria-hidden="true" />
        <span class={RETRY_TEXT}>{RETRY_LABEL}</span>
      </Button>
    </>
  )
}

function EffortBars(props: {levels: readonly ReasoningEffort[]; value: ReasoningEffort}): JSX.Element {
  const active = () => props.levels.indexOf(props.value)
  const change = createMemo<{from: number; to: number}>((last) => ({from: last?.to ?? active(), to: active()}))
  const delay = (index: number) => {
    const {from, to} = change()
    if (index > from && index <= to) return (index - from - 1) * BAR_STEP_MS
    if (index > to && index <= from) return (from - index) * BAR_STEP_MS
    return 0
  }
  return (
    <span class={BARS} aria-hidden="true">
      <For each={props.levels}>
        {(_, index) => (
          <span
            class={index() <= active() ? BAR_ON : BAR_OFF}
            style={{
              height: `${((index() + 1) / props.levels.length) * 100}%`,
              '--bar-delay': `${delay(index())}ms`,
            }}
          />
        )}
      </For>
    </span>
  )
}

function ModelRow(props: {row: ModelMenuRow}): JSX.Element {
  return (
    <Listbox.Item item={props.row}>
      <span class={ROW_BODY}>
        <Listbox.ItemText class={ROW_NAME}>{props.row.label}</Listbox.ItemText>
        <Show when={props.row.model.description}>
          {(description) => <span class={ROW_DESCRIPTION}>{description()}</span>}
        </Show>
      </span>
      <span class={ROW_END}>
        <Listbox.ItemIndicator>
          <Check class="size-4 block" aria-hidden="true" />
        </Listbox.ItemIndicator>
      </span>
    </Listbox.Item>
  )
}

function OlderModels(props: {
  group: OlderModelGroup
  open: boolean
  onOpenChange: (open: boolean) => void
}): JSX.Element {
  const [local] = splitProps(props, ['group', 'open', 'onOpenChange'])
  return (
    <Collapsible.Root open={local.open} onOpenChange={(details) => local.onOpenChange(details.open)}>
      <Collapsible.Trigger class={GROUP_TRIGGER} onKeyDown={(event) => event.stopPropagation()}>
        <span class={ROW_BODY}>
          <span class={ROW_NAME}>{local.group.name}</span>
        </span>
        <ChevronRight class={GROUP_CHEVRON} aria-hidden="true" />
      </Collapsible.Trigger>
      <Collapsible.Content>
        <For each={local.group.rows}>{(row) => <ModelRow row={row} />}</For>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}

function HarnessGroup(props: {
  section: HarnessSection
  named: boolean
  isOpen: (group: OlderModelGroup) => boolean
  onExpand: (key: string, open: boolean) => void
}): JSX.Element {
  const [local] = splitProps(props, ['section', 'named', 'isOpen', 'onExpand'])
  return (
    <Listbox.ItemGroup>
      <Listbox.ItemGroupLabel class={local.named ? LIST_PANEL_GROUP_LABEL : 'sr-only'}>
        {local.section.harness.name}
      </Listbox.ItemGroupLabel>
      <Show when={loginMessage(local.section.harness)}>{(message) => <p class={MESSAGE}>{message()}</p>}</Show>
      <For each={local.section.rows}>{(row) => <ModelRow row={row} />}</For>
      <Show when={local.section.harness.models.length === 0}>
        <p class={MESSAGE}>{`${local.section.harness.name} has no usable models`}</p>
      </Show>
      <Show when={local.section.more.length > 0}>
        <p class={MESSAGE}>{moreModelsLabel(local.section.more.length)}</p>
      </Show>
      <For each={local.section.older}>
        {(group) => (
          <OlderModels
            group={group}
            open={local.isOpen(group)}
            onOpenChange={(open) => local.onExpand(group.key, open)}
          />
        )}
      </For>
    </Listbox.ItemGroup>
  )
}

function EffortSection(props: {
  efforts: readonly ReasoningEffort[]
  value: ReasoningEffort | null
  onSelect: (effort: ReasoningEffort | null) => void
}): JSX.Element {
  const [local] = splitProps(props, ['efforts', 'value', 'onSelect'])
  const select = (value: string | null) => {
    if (value === EFFORT_DEFAULT) return local.onSelect(null)
    const parsed = ReasoningEffortSchema.safeParse(value)
    if (parsed.success) local.onSelect(parsed.data)
  }
  return (
    <div class={EFFORT}>
      <div class={EFFORT_HEAD}>
        <span class={EFFORT_TITLE}>{EFFORT_LABEL}</span>
        <span class={EFFORT_HINT_TEXT} aria-hidden="true">
          {EFFORT_HINT}
        </span>
      </div>
      <SegmentGroup.Root
        class={EFFORT_TRACK}
        value={local.value ?? EFFORT_DEFAULT}
        onValueChange={(details) => select(details.value)}
        aria-label={EFFORT_LABEL}
      >
        <SegmentGroup.Indicator />
        <SegmentGroup.Item class={EFFORT_SEGMENT} value={EFFORT_DEFAULT}>
          <SegmentGroup.ItemText>{EFFORT_DEFAULT_NAME}</SegmentGroup.ItemText>
          <SegmentGroup.ItemHiddenInput />
        </SegmentGroup.Item>
        <For each={effortLevels(local.efforts)}>
          {(level) => (
            <SegmentGroup.Item class={EFFORT_SEGMENT} value={level}>
              <SegmentGroup.ItemText>{EFFORT_NAME[level]}</SegmentGroup.ItemText>
              <SegmentGroup.ItemHiddenInput />
            </SegmentGroup.Item>
          )}
        </For>
      </SegmentGroup.Root>
      <div class={EFFORT_NOTE_BOX}>
        <p class={EFFORT_NOTE_TEXT} aria-live="polite">
          {effortNote(local.value)}
        </p>
      </div>
    </div>
  )
}

function SwitchConfirm(props: {
  target: ModelSwitchTarget
  history: readonly ChatMessage[]
  registerLayer: HarnessModelSelectorProps['registerLayer']
  onSettle: () => void
  onConfirm: (target: ModelSwitchTarget) => void
}): JSX.Element {
  const [local] = splitProps(props, ['target', 'history', 'registerLayer', 'onSettle', 'onConfirm'])
  onMount(() => {
    const release = local.registerLayer?.(() => true, false)
    onCleanup(() => release?.())
  })
  const changeOpen = (open: boolean) => {
    if (!open) local.onSettle()
  }
  return (
    <Dialog
      open
      onOpenChange={changeOpen}
      title="Switch harness?"
      role="alertdialog"
      dismissable
      footer={
        <div class="flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => local.onSettle()}>
            Cancel
          </Button>
          <Button onClick={() => local.onConfirm(local.target)}>Switch to {local.target.harness.name}</Button>
        </div>
      }
    >
      <p class="text-[0.8125rem] text-chat-text m-0">
        Switching to {local.target.harness.name} sends this chat’s history (about {historyTokensLabel(local.history)}).
      </p>
    </Dialog>
  )
}

export function HarnessModelSelector(props: HarnessModelSelectorProps): JSX.Element {
  const filter = useFilter({sensitivity: 'base'})
  const ownEntry = createMemo(() => (props.models === undefined ? undefined : menuEntry(props.models)))
  const loading = () => props.status === 'loading'
  const failed = () => props.status === 'failed'
  const entries = createMemo(() => (loading() ? [] : withOwnEntry(props.others?.harnesses ?? [], ownEntry())))
  const named = () => entries().length > 1
  const harness = () => entries().find((entry) => entry.id === ownEntry()?.id)
  const models = () => harness()?.models ?? []
  const value = () => props.value ?? harness()?.defaultModel ?? null
  const current = createMemo(() => models().find((model) => model.id === value()))
  const effort = createMemo(() => listedEffort(props.effort ?? null, current()))
  const shownName = () =>
    loading() ? MODELS_LOADING : promptName(harness(), current()?.name ?? value() ?? '', named())
  const noModels = () =>
    props.status === 'ready' &&
    !props.others?.failed &&
    entries().every((entry) => entry.models.length === 0 && !entry.modelsFailed)
  const sections = createMemo(() => {
    const [mine, others] = partition(
      entries().filter((entry) => !entry.modelsFailed),
      (entry) => entry.id === harness()?.id,
    )
    return [...mine, ...others].map((entry) =>
      harnessSection(entry, named(), entry.id === harness()?.id ? value() : null),
    )
  })
  const query = () => props.menu.state.query.trim()
  const matches = (candidate: ModelMenuRow) =>
    [candidate.model.name, candidate.model.id, candidate.harness.name].some((field) =>
      filter().contains(field, query()),
    )
  const visibleSections = createMemo((): HarnessSection[] => {
    if (query() === '') return sections()
    return sections()
      .map((section) => searchedSection(section, matches))
      .filter((section) => section.rows.length > 0)
  })
  const selected = () => {
    const owner = harness()
    const id = value()
    return owner === undefined || id === null ? [] : [rowValue(owner.id, id)]
  }
  const isOpen = (group: OlderModelGroup) =>
    props.menu.state.expanded[group.key] ?? group.rows.some((candidate) => selected().includes(candidate.value))
  const foreignDisabled = (candidate: ModelMenuRow) =>
    candidate.harness.id !== harness()?.id && props.switchBlocked === true
  const collection = createMemo(() =>
    createListCollection<ModelMenuRow>({
      items: visibleSections().flatMap((section) => [
        ...section.rows,
        ...section.older.filter(isOpen).flatMap((group) => group.rows),
      ]),
      itemToValue: (item) => item.value,
      itemToString: (item) => item.label,
      isItemDisabled: (item) => item.model.disabled === true || foreignDisabled(item),
    }),
  )
  const unavailable = () => entries().filter((entry) => entry.modelsFailed)
  const close = () => props.menu.popover().setOpen(false)
  let content: HTMLDivElement | undefined
  const retry = () => {
    content?.focus()
    props.onRetry()
  }
  const switchHarness = (target: ModelSwitchTarget) => {
    void props.onSwitchHarness?.(target).then(
      () => props.announce?.(`Switched to ${target.label}.`),
      () => undefined,
    )
  }
  const switchTo = (target: ModelSwitchTarget) => {
    if ((props.history?.length ?? 0) > 0) {
      props.menu.confirm(target)
      close()
      return
    }
    close()
    switchHarness(target)
  }
  const confirmSwitch = (target: ModelSwitchTarget) => {
    props.menu.settle()
    switchHarness(target)
  }
  const select = (picked: ModelMenuRow | null) => {
    if (picked === null) return
    if (picked.harness.id !== harness()?.id) {
      switchTo({harness: picked.harness, model: picked.model, label: modelLabel(picked.model, picked.harness, true)})
      return
    }
    close()
    if (picked.model.id === value()) return
    void Promise.resolve(props.onModelChange(picked.model.id)).catch(() => props.announce?.(SWITCH_FAILED, true))
  }
  const selectEffort = (next: ReasoningEffort | null) => {
    if (next === effort()) return
    void props.onEffortChange?.(next).catch(() => props.announce?.(EFFORT_SWITCH_FAILED, true))
  }
  const pill = () => props.appearance !== 'prompt'
  const pillLabel = () => {
    if (failed()) return MODELS_UNAVAILABLE
    if (loading()) return PILL_LOADING
    return noModels() ? PILL_EMPTY : PILL_LABEL
  }
  const pillName = () => {
    if (failed()) return PILL_FAILED
    if (loading()) return PILL_LOADING
    return noModels() ? PILL_EMPTY : promptName(harness(), current()?.name ?? value() ?? '', named())
  }

  return (
    <div class={pill() ? 'contents' : PROMPT_SLOT}>
      <Popover.RootProvider value={props.menu.popover} lazyMount unmountOnExit onExitComplete={props.menu.ask}>
        <Popover.Trigger
          asChild={(triggerProps) => (
            <Button
              {...triggerProps()}
              variant="plain"
              size="none"
              class={pill() ? MODEL_SELECTOR_TRIGGER : PROMPT}
              disabled={(props.disabled === true && !failed()) || (pill() && noModels())}
              title={pill() ? pillLabel() : undefined}
              aria-label={pill() ? pillLabel() : failed() ? MODELS_UNAVAILABLE : promptAriaLabel(shownName(), effort())}
            >
              <Switch>
                <Match when={pill()}>
                  <span class={PILL_STACK}>
                    <span class={PILL_LAYER}>
                      <Show when={failed()}>
                        <FailedMark announce={props.announce} />
                      </Show>
                      <span class={PILL_NAME}>{pillName()}</span>
                    </span>
                    <For each={PILL_STATES}>{(label) => <PillGhost label={label} />}</For>
                  </span>
                  <ChevronsUpDown size={13} class="opacity-70 shrink-0" aria-hidden="true" />
                </Match>
                <Match when={failed()}>
                  <FailedMark announce={props.announce} />
                </Match>
                <Match when={!pill()}>
                  <Show when={shownName().toLowerCase()} keyed>
                    {(label) => <span class={PROMPT_MODEL}>{label}</span>}
                  </Show>
                  <Show when={effort()}>
                    {(level) => <EffortBars levels={effortLevels(current()?.efforts ?? [])} value={level()} />}
                  </Show>
                </Match>
              </Switch>
            </Button>
          )}
        />
        <Popover.Positioner>
          <Popover.Content
            ref={(element) => {
              content = element
            }}
            class={CONTENT}
            aria-label={MENU_LABEL}
          >
            <Switch>
              <Match when={failed()}>
                <RetryRow reason={MODELS_UNAVAILABLE} onRetry={retry} />
              </Match>
              <Match when={!failed()}>
                <Listbox.Root
                  collection={collection()}
                  value={selected()}
                  defaultHighlightedValue={selected()[0] ?? null}
                  onSelect={(details) => select(collection().find(details.value))}
                  loopFocus
                >
                  <Listbox.Label class="sr-only">{MENU_LABEL}</Listbox.Label>
                  <div class={SEARCH_ROW}>
                    <Search class="shrink-0 size-4 block" aria-hidden="true" />
                    <Listbox.Input
                      autoHighlight
                      class={SEARCH_INPUT}
                      aria-label={SEARCH_LABEL}
                      placeholder={SEARCH_LABEL}
                      value={props.menu.state.query}
                      onInput={(event) => props.menu.search(event.currentTarget.value)}
                    />
                  </div>
                  <Listbox.Content class={LIST}>
                    <For each={visibleSections()}>
                      {(section) => (
                        <HarnessGroup section={section} named={named()} isOpen={isOpen} onExpand={props.menu.expand} />
                      )}
                    </For>
                  </Listbox.Content>
                </Listbox.Root>
                <Show when={loading()}>
                  <p class={MESSAGE} role="status">{`${MODELS_LOADING}…`}</p>
                </Show>
                <Show when={query() !== '' && collection().size === 0}>
                  <p class={MESSAGE} role="status">{`No models match “${query()}”`}</p>
                </Show>
                <For each={unavailable()}>
                  {(entry) => (
                    <RetryRow
                      reason={`Couldn’t load ${entry.name} models`}
                      onRetry={() => (entry.id === harness()?.id ? retry() : props.others?.retry())}
                    />
                  )}
                </For>
                <Show when={props.others?.failed}>
                  <RetryRow reason="Couldn’t load the other harnesses" onRetry={() => props.others?.retry()} />
                </Show>
                <Show when={props.onEffortChange && current()?.efforts}>
                  {(efforts) => (
                    <>
                      <div class={SEPARATOR} />
                      <EffortSection efforts={efforts()} value={effort()} onSelect={selectEffort} />
                    </>
                  )}
                </Show>
              </Match>
            </Switch>
          </Popover.Content>
        </Popover.Positioner>
      </Popover.RootProvider>
      <Show when={props.menu.state.asking && props.menu.state.confirming}>
        {(target) => (
          <SwitchConfirm
            target={target()}
            history={props.history ?? []}
            registerLayer={props.registerLayer}
            onSettle={props.menu.settle}
            onConfirm={confirmSwitch}
          />
        )}
      </Show>
      <Show when={!pill()}>
        <span class={PROMPT_FONT}>
          <span class={PROMPT_GLYPH} aria-hidden="true">
            ❯
          </span>
        </span>
      </Show>
    </div>
  )
}
