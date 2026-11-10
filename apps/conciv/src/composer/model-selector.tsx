import {createEffect, createMemo, For, Match, on, Show, splitProps, Suspense, Switch, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {useMutation, useQuery} from '@conciv/client'
import {groupBy, partition} from 'es-toolkit'
import {useFilter} from '@ark-ui/solid/locale'
import {
  Button,
  Collapsible,
  createListCollection,
  LIST_PANEL_GROUP_LABEL,
  Listbox,
  Popover,
  SegmentGroup,
  usePopover,
  type PopoverMachine,
} from '@conciv/ui-kit-system'
import {getHostApi} from '@conciv/extension/host'
import RotateCw from 'lucide-solid/icons/rotate-cw'
import Check from 'lucide-solid/icons/check'
import ChevronRight from 'lucide-solid/icons/chevron-right'
import Search from 'lucide-solid/icons/search'
import {
  ReasoningEffortSchema,
  type HarnessMenuEntry,
  type HarnessModelInfo,
  type ReasoningEffort,
} from '@conciv/protocol/chat-types'
import type {ChatMessage} from '@conciv/protocol/chat-message-types'
import {useAnnounce, useAppData, useRpc} from '../app/context.js'
import {usePane} from '../app/pane-context.js'
import {useRefetchSessionHarness, useSessionModels} from '../data/harness-meta.js'
import {useNotices} from '../shell/notice-context.js'
import {rpcErrorCode} from '../shell/rpc-error-message.js'

const MODELS_UNAVAILABLE = 'Couldn’t load models'
const MODELS_LOADING = 'Loading models'
const RETRY_LABEL = 'Retry loading models'
const SWITCH_FAILED = 'Could not switch model'
const MENU_LABEL = 'Model'
const SEARCH_LABEL = 'Search models'
const EFFORT_LABEL = 'Effort'
const EFFORT_HINT = '←→ to adjust'
const EFFORT_SWITCH_FAILED = 'Could not switch effort'
const EFFORT_ORDER: readonly ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh', 'max']
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
const CHARACTERS_PER_TOKEN = 4
const MAIN_ROWS = 4
const MODEL_COUNT = new Intl.NumberFormat(undefined)
const MODEL_PLURAL = new Intl.PluralRules(undefined)
const TOKEN_COUNT = new Intl.NumberFormat(undefined)
const TOKEN_PLURAL = new Intl.PluralRules(undefined)

const PROMPT_FONT = '[font-family:var(--chat-mono)] text-[13px] leading-[1.45]'
const PROMPT_SLOT = 'flex-none flex items-center gap-1.5 min-h-7 select-none'
const PROMPT = `inline-flex items-center gap-1 min-h-7 overflow-hidden -ms-1.5 px-1.5 rounded-[var(--chat-radius-sm)] focus-ring trans-bg hover:bg-chat-fill-strong data-[state=open]:bg-chat-fill-strong ${PROMPT_FONT}`
const PROMPT_MODEL = 'max-w-[32ch] truncate text-chat-text-3 anim-word-in tracking-[-0.04em] [word-spacing:-0.3em]'
const PROMPT_GLYPH = 'text-chat-accent'
const BARS = 'inline-flex items-end gap-[2px] h-[0.75em]'
const BAR =
  'w-[2px] rounded-[1px] [transition:background-color_160ms_var(--chat-ease)_var(--bar-delay)] motion-reduce:[transition:none]'
const BAR_STEP_MS = 45
const BAR_ON = `${BAR} bg-chat-text-3`
const BAR_OFF = `${BAR} bg-chat-line-2`
const CONTENT = 'w-80 max-w-[var(--available-width)] p-1'
const SEARCH_ROW = 'flex items-center gap-2 px-2.5 pb-1 mb-1 border-b border-b-chat-line-soft text-chat-text-3'
const SEARCH_INPUT =
  'flex-1 min-w-0 h-8 bg-transparent [border:none] text-[0.8125rem] text-chat-text placeholder:text-chat-text-3 focus:outline-none'
const LIST = 'max-h-80 overflow-y-auto overscroll-contain'
const GROUP_TRIGGER =
  'group flex w-full items-center gap-3 py-2 px-2.5 rounded-chat-surface-sm [border:none] bg-transparent text-start cursor-pointer select-none focus-ring trans-bg hover:bg-chat-fill'
const GROUP_CHEVRON =
  'size-4 block text-chat-text-3 [transition:rotate_200ms_var(--chat-ease-expo)] group-data-[state=open]:rotate-90 motion-reduce:[transition:none]'
const RETRY = 'flex w-full items-center gap-2 py-2 px-2.5 text-[0.8125rem] text-chat-text-2'
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

type MenuRow = {harness: HarnessMenuEntry; model: HarnessModelInfo; value: string; label: string}
type OlderGroup = {key: string; name: string; rows: MenuRow[]}
type HarnessSection = {harness: HarnessMenuEntry; rows: MenuRow[]; more: MenuRow[]; older: OlderGroup[]}
type SwitchTarget = {harness: HarnessMenuEntry; model: HarnessModelInfo; label: string}
type MenuState = {
  query: string
  expanded: Record<string, boolean>
  confirming: SwitchTarget | null
  asking: boolean
}

export type ModelMenu = {
  popover: PopoverMachine
  state: MenuState
  search: (query: string) => void
  expand: (key: string, open: boolean) => void
  confirm: (target: SwitchTarget) => void
  ask: () => void
  settle: () => void
}

function rowValue(harnessId: string, modelId: string): string {
  return `${harnessId}:${modelId}`
}

function modelLabel(model: HarnessModelInfo, harness: HarnessMenuEntry, named: boolean): string {
  return named ? `${model.name} (${harness.name})` : model.name
}

function mainAndMore(
  models: HarnessModelInfo[],
  kept: readonly (string | null)[],
): [HarnessModelInfo[], HarnessModelInfo[]] {
  if (models.length <= MAIN_ROWS) return [models, []]
  const newest = models.filter((model) => !kept.includes(model.id)).slice(0, MAIN_ROWS - 1)
  return partition(models, (model) => kept.includes(model.id) || newest.includes(model))
}

function moreModelsLabel(count: number): string {
  return `${MODEL_COUNT.format(count)} more ${MODEL_PLURAL.select(count) === 'one' ? 'model' : 'models'}, type to search`
}

function harnessSection(harness: HarnessMenuEntry, named: boolean, selectedModel: string | null): HarnessSection {
  const toRows = (models: HarnessModelInfo[]) =>
    models.map((model) => ({
      harness,
      model,
      value: rowValue(harness.id, model.id),
      label: modelLabel(model, harness, named),
    }))
  const [first, ...later] = Object.entries(groupBy(harness.models, (model) => model.group ?? ''))
  const [main, more] = mainAndMore(first?.[1] ?? [], [harness.defaultModel, selectedModel])
  return {
    harness,
    rows: toRows(main),
    more: toRows(more),
    older: later.map(([name, models]) => ({key: rowValue(harness.id, name), name, rows: toRows(models)})),
  }
}

function searchedSection(section: HarnessSection, matches: (row: MenuRow) => boolean): HarnessSection {
  const rows = [...section.rows, ...section.more, ...section.older.flatMap((group) => group.rows)]
  return {...section, rows: rows.filter(matches), more: [], older: []}
}

function withOwnEntry(listed: HarnessMenuEntry[], mine: HarnessMenuEntry | undefined): HarnessMenuEntry[] {
  if (mine === undefined) return listed
  if (!listed.some((entry) => entry.id === mine.id)) return [mine, ...listed]
  return listed.map((entry) => (entry.id === mine.id ? mine : entry))
}

function promptName(owner: HarnessMenuEntry | undefined, model: string, named: boolean): string {
  if (owner === undefined) return ''
  if (owner.models.length === 0) return owner.name
  return named ? `${model} (${owner.name})` : model
}

function listedEffort(stored: ReasoningEffort | null, model: HarnessModelInfo | undefined): ReasoningEffort | null {
  return stored !== null && model?.efforts?.includes(stored) ? stored : null
}

function effortLevels(efforts: readonly ReasoningEffort[]): ReasoningEffort[] {
  return EFFORT_ORDER.filter((level) => efforts.includes(level))
}

function effortNote(effort: ReasoningEffort | null): string {
  return effort === null ? EFFORT_DEFAULT_NOTE : EFFORT_NOTE[effort]
}

function promptAriaLabel(name: string, effort: ReasoningEffort | null): string {
  const label = `${MENU_LABEL}: ${name}`
  return effort === null ? label : `${label}, effort ${EFFORT_NAME[effort]}`
}

function estimatedTokens(messages: readonly ChatMessage[]): number {
  const characters = messages
    .flatMap((message) => message.parts)
    .reduce((total, part) => total + (part.type === 'text' ? part.content.length : 0), 0)
  return Math.ceil(characters / CHARACTERS_PER_TOKEN)
}

function tokensLabel(tokens: number): string {
  return `${TOKEN_COUNT.format(tokens)} ${TOKEN_PLURAL.select(tokens) === 'one' ? 'token' : 'tokens'}`
}

function switchFailure(error: unknown, target: SwitchTarget): string {
  const code = rpcErrorCode(error)
  if (code === 'SESSION_RUNNING') return `Wait for the reply to finish, then switch to ${target.harness.name}.`
  if (code === 'UNKNOWN_HARNESS') return `${target.harness.name} is no longer available.`
  if (code === 'UNKNOWN_MODEL') return `${target.label} is no longer available.`
  if (code === 'NOT_FOUND') return 'This session no longer exists.'
  return `Couldn’t switch to ${target.label}.`
}

function Glyph(): JSX.Element {
  return (
    <span class={PROMPT_GLYPH} aria-hidden="true">
      ❯
    </span>
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

function ModelRow(props: {row: MenuRow}): JSX.Element {
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

function OlderModels(props: {group: OlderGroup; open: boolean; onOpenChange: (open: boolean) => void}): JSX.Element {
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
  isOpen: (group: OlderGroup) => boolean
  onExpand: (key: string, open: boolean) => void
}): JSX.Element {
  const [local] = splitProps(props, ['section', 'named', 'isOpen', 'onExpand'])
  return (
    <Listbox.ItemGroup>
      <Listbox.ItemGroupLabel class={local.named ? LIST_PANEL_GROUP_LABEL : 'sr-only'}>
        {local.section.harness.name}
      </Listbox.ItemGroupLabel>
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
  target: SwitchTarget
  messages: readonly ChatMessage[]
  onSettle: () => void
  onConfirm: (target: SwitchTarget) => void
}): JSX.Element {
  const [local] = splitProps(props, ['target', 'messages', 'onSettle', 'onConfirm'])
  const Dialog = getHostApi().useDialog()
  const changeOpen = (open: boolean) => {
    if (!open) local.onSettle()
  }
  return (
    <Dialog
      open
      onOpenChange={changeOpen}
      title="Switch harness?"
      role="alertdialog"
      layer="inline"
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
        Switching to {local.target.harness.name} sends this chat’s history (about{' '}
        {tokensLabel(estimatedTokens(local.messages))}).
      </p>
    </Dialog>
  )
}

export function useModelMenu(onClose: () => void): ModelMenu {
  const [state, setState] = createStore<MenuState>({query: '', expanded: {}, confirming: null, asking: false})
  const popover = usePopover({
    positioning: {placement: 'top-start'},
    restoreFocus: false,
    onEscapeKeyDown: (event) => {
      if (state.query === '') return
      event.preventDefault()
      setState('query', '')
    },
    onOpenChange: (details) => {
      if (details.open) return
      setState({query: '', expanded: {}})
      if (state.confirming === null) onClose()
    },
  })
  return {
    popover,
    state,
    search: (query) => setState('query', query),
    expand: (key, open) => setState('expanded', key, open),
    confirm: (target) => setState('confirming', target),
    ask: () => setState('asking', state.confirming !== null),
    settle: () => {
      setState({confirming: null, asking: false})
      onClose()
    },
  }
}

type SessionModelPromptProps = {
  sessionId: string
  menu: ModelMenu
  running: boolean
}

export function SessionModelPrompt(props: SessionModelPromptProps): JSX.Element {
  return (
    <div class={PROMPT_SLOT}>
      <Suspense>
        <SessionModelMenu sessionId={props.sessionId} menu={props.menu} running={props.running} />
      </Suspense>
      <span class={PROMPT_FONT}>
        <Glyph />
      </span>
    </div>
  )
}

function useSessionChoices(sessionId: () => string) {
  const appData = useAppData()
  const rpc = useRpc()
  const announce = useAnnounce()
  const notices = useNotices()
  const pane = usePane()
  const refetchSessionHarness = useRefetchSessionHarness()
  const setModel = useMutation(() => ({
    mutationFn: (input: {sessionId: string; model: string}) => rpc.sessions.model(input),
    onError: () => announce(SWITCH_FAILED, true),
    onSettled: (_result, _error, input) => appData.invalidateSession(input.sessionId),
  }))
  const setEffort = useMutation(() => ({
    mutationFn: (input: {sessionId: string; effort: ReasoningEffort | null}) => rpc.sessions.effort(input),
    onError: () => announce(EFFORT_SWITCH_FAILED, true),
    onSettled: (_result, _error, input) => appData.invalidateSession(input.sessionId),
  }))
  const switchHarness = useMutation(() => ({
    mutationFn: (target: SwitchTarget) =>
      rpc.sessions.switchHarness({sessionId: sessionId(), harnessId: target.harness.id, model: target.model.id}),
    onSuccess: async (_switched: {harnessId: string}, target: SwitchTarget) => {
      const [, refreshed] = await Promise.allSettled([refetchSessionHarness(sessionId()), pane.chat().refresh()])
      announce(`Switched to ${target.label}.`)
      if (refreshed.status === 'rejected')
        notices.notify('Couldn’t refresh the conversation. Refresh it to see which harness wrote each reply.', {
          tone: 'warn',
        })
    },
    onError: (error: unknown, target: SwitchTarget) => notices.notify(switchFailure(error, target), {tone: 'warn'}),
  }))
  return {setModel, setEffort, switchHarness}
}

function SessionModelMenu(props: SessionModelPromptProps): JSX.Element {
  const appData = useAppData()
  const announce = useAnnounce()
  const pane = usePane()
  const filter = useFilter({sensitivity: 'base'})
  const own = useSessionModels(() => props.sessionId)
  const catalog = useQuery(() => appData.utils.meta.harnesses.queryOptions())
  const session = useQuery(() => appData.utils.sessions.get.queryOptions({input: {sessionId: props.sessionId}}))
  const {setModel, setEffort, switchHarness} = useSessionChoices(() => props.sessionId)

  const ownModels = () => (own.isPending ? undefined : own.data)
  const ownEntry = createMemo((): HarnessMenuEntry | undefined => {
    const loaded = ownModels()
    return loaded === undefined
      ? undefined
      : {...loaded.harness, models: loaded.models, defaultModel: loaded.defaultModel, modelsFailed: false}
  })
  const loading = () => own.isPending
  const entries = createMemo(() =>
    loading() ? [] : withOwnEntry(catalog.isSuccess ? catalog.data.harnesses : [], ownEntry()),
  )
  const named = () => entries().length > 1
  const row = () => (session.isPending ? undefined : session.data)
  const harness = () => entries().find((entry) => entry.id === ownEntry()?.id)
  const models = () => harness()?.models ?? []
  const value = () =>
    (setModel.isPending ? setModel.variables?.model : undefined) ?? row()?.model ?? harness()?.defaultModel ?? null
  const current = createMemo(() => models().find((model) => model.id === value()))
  const effort = createMemo(() =>
    listedEffort(setEffort.isPending ? (setEffort.variables?.effort ?? null) : (row()?.effort ?? null), current()),
  )
  const shownName = () =>
    loading() ? MODELS_LOADING : promptName(harness(), current()?.name ?? value() ?? '', named())
  const failed = () => own.isError && models().length === 0
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
  const matches = (candidate: MenuRow) =>
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
  const isOpen = (group: OlderGroup) =>
    props.menu.state.expanded[group.key] ?? group.rows.some((candidate) => selected().includes(candidate.value))
  const foreignDisabled = (candidate: MenuRow) =>
    candidate.harness.id !== harness()?.id && (props.running || switchHarness.isPending)
  const collection = createMemo(() =>
    createListCollection<MenuRow>({
      items: visibleSections().flatMap((section) => [
        ...section.rows,
        ...section.older.filter(isOpen).flatMap((group) => group.rows),
      ]),
      itemToValue: (item) => item.value,
      itemToString: (item) => item.label,
      isItemDisabled: (item) => item.model.disabled === true || foreignDisabled(item),
    }),
  )
  const unavailable = () => entries().filter((entry) => entry.modelsFailed && entry.id !== harness()?.id)
  const close = () => props.menu.popover().setOpen(false)
  const switchTo = (target: SwitchTarget) => {
    if (pane.chat().messages().length > 0) {
      props.menu.confirm(target)
      close()
      return
    }
    close()
    switchHarness.mutate(target)
  }
  const confirmSwitch = (target: SwitchTarget) => {
    props.menu.settle()
    switchHarness.mutate(target)
  }
  const select = (picked: MenuRow | null) => {
    if (picked === null) return
    if (picked.harness.id !== harness()?.id) {
      switchTo({harness: picked.harness, model: picked.model, label: modelLabel(picked.model, picked.harness, true)})
      return
    }
    close()
    if (picked.model.id !== value()) setModel.mutate({sessionId: props.sessionId, model: picked.model.id})
  }
  const selectEffort = (next: ReasoningEffort | null) => {
    if (next === effort()) return
    setEffort.mutate({sessionId: props.sessionId, effort: next})
  }
  createEffect(
    on(
      () => own.isError,
      (isError) => {
        if (isError) announce(MODELS_UNAVAILABLE)
      },
    ),
  )

  return (
    <>
      <Popover.RootProvider value={props.menu.popover} lazyMount unmountOnExit onExitComplete={props.menu.ask}>
        <Popover.Trigger
          asChild={(triggerProps) => (
            <Button
              {...triggerProps()}
              variant="plain"
              size="none"
              class={PROMPT}
              aria-label={failed() ? MODELS_UNAVAILABLE : promptAriaLabel(shownName(), effort())}
            >
              <Show when={!failed()} fallback={<RotateCw class="size-3.5 block text-chat-text-3" aria-hidden="true" />}>
                <Show when={shownName().toLowerCase()} keyed>
                  {(label) => <span class={PROMPT_MODEL}>{label}</span>}
                </Show>
                <Show when={effort()}>
                  {(level) => <EffortBars levels={effortLevels(current()?.efforts ?? [])} value={level()} />}
                </Show>
              </Show>
            </Button>
          )}
        />
        <Popover.Positioner>
          <Popover.Content class={CONTENT} aria-label={MENU_LABEL}>
            <Switch>
              <Match when={failed()}>
                <Button variant="plain" size="none" class={RETRY} onClick={() => void own.refetch()}>
                  <RotateCw class="size-4 block" aria-hidden="true" />
                  {`${MODELS_UNAVAILABLE}: ${RETRY_LABEL}`}
                </Button>
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
                    <Search class="size-4 block shrink-0" aria-hidden="true" />
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
                    <Button variant="plain" size="none" class={RETRY} onClick={() => void catalog.refetch()}>
                      <RotateCw class="size-4 block" aria-hidden="true" />
                      {`Couldn’t load ${entry.name} models: ${RETRY_LABEL}`}
                    </Button>
                  )}
                </For>
                <Show when={catalog.isError}>
                  <Button variant="plain" size="none" class={RETRY} onClick={() => void catalog.refetch()}>
                    <RotateCw class="size-4 block" aria-hidden="true" />
                    {`Couldn’t load the other harnesses: ${RETRY_LABEL}`}
                  </Button>
                </Show>
                <Show when={current()?.efforts}>
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
            messages={pane.chat().messages()}
            onSettle={props.menu.settle}
            onConfirm={confirmSwitch}
          />
        )}
      </Show>
    </>
  )
}
