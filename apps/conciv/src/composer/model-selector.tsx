import {createEffect, createMemo, For, Match, on, Show, splitProps, Suspense, Switch, type JSX} from 'solid-js'
import {useMutation, useQuery, useQueryClient} from '@tanstack/solid-query'
import {groupBy} from 'es-toolkit'
import {
  Button,
  Collapsible,
  createListCollection,
  Listbox,
  Popover,
  SegmentGroup,
  usePopover,
  type PopoverMachine,
} from '@conciv/ui-kit-system'
import RotateCw from 'lucide-solid/icons/rotate-cw'
import Check from 'lucide-solid/icons/check'
import ChevronRight from 'lucide-solid/icons/chevron-right'
import {ReasoningEffortSchema, type HarnessModelInfo, type ReasoningEffort} from '@conciv/protocol/chat-types'
import {useAnnounce, useAppData, useRpc} from '../app/context.js'

const MODELS_UNAVAILABLE = 'Couldn’t load models'
const RETRY_LABEL = 'Retry loading models'
const SWITCH_FAILED = 'Could not switch model'
const MENU_LABEL = 'Model'
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

const PROMPT_FONT = '[font-family:var(--chat-mono)] text-[13px] leading-[1.45]'
const PROMPT_SLOT = 'flex-none flex items-center gap-1.5 min-h-7 select-none'
const PROMPT = `inline-flex items-center gap-1 min-h-7 overflow-hidden -ms-1.5 px-1.5 rounded-[var(--chat-radius-sm)] focus-ring trans-bg hover:bg-chat-fill-strong data-[state=open]:bg-chat-fill-strong ${PROMPT_FONT}`
const PROMPT_MODEL = 'max-w-[22ch] truncate text-chat-text-3 anim-word-in tracking-[-0.04em] [word-spacing:-0.3em]'
const PROMPT_GLYPH = 'text-chat-accent'
const BARS = 'inline-flex items-end gap-[2px] h-[0.75em]'
const BAR =
  'w-[2px] rounded-[1px] [transition:background-color_160ms_var(--chat-ease)_var(--bar-delay)] motion-reduce:[transition:none]'
const BAR_STEP_MS = 45
const BAR_ON = `${BAR} bg-chat-text-3`
const BAR_OFF = `${BAR} bg-chat-line-2`
const CONTENT = 'w-72 p-1'
const GROUP_TRIGGER =
  'group flex w-full items-center gap-3 py-2 px-2.5 rounded-chat-surface-sm [border:none] bg-transparent text-start cursor-pointer select-none focus-ring trans-bg hover:bg-chat-fill'
const GROUP_CHEVRON =
  'size-4 block text-chat-text-3 [transition:rotate_200ms_var(--chat-ease-expo)] group-data-[state=open]:rotate-90 motion-reduce:[transition:none]'
const OLDER_LIST = 'max-h-56 overflow-y-auto'
const RETRY = 'flex w-full items-center gap-2 py-2 px-2.5 text-[0.8125rem] text-chat-text-2'
const ROW_BODY = 'flex flex-col flex-1 min-w-0'
const ROW_NAME = 'block text-[0.875rem] text-chat-text-hi'
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

type ModelGroup = {name: string; models: HarnessModelInfo[]}

function promptLabel(model: HarnessModelInfo | undefined, id: string | null): string {
  return model ? model.name.toLowerCase() : (id ?? '')
}

function promptAriaLabel(
  model: HarnessModelInfo | undefined,
  id: string | null,
  effort: ReasoningEffort | null,
): string {
  const name = `${MENU_LABEL}: ${model?.name ?? id ?? ''}`
  return effort === null ? name : `${name}, effort ${EFFORT_NAME[effort]}`
}

function effortLevels(efforts: readonly ReasoningEffort[]): ReasoningEffort[] {
  return EFFORT_ORDER.filter((level) => efforts.includes(level))
}

function effortNote(effort: ReasoningEffort | null): string {
  return effort === null ? EFFORT_DEFAULT_NOTE : EFFORT_NOTE[effort]
}

function modelGroups(models: readonly HarnessModelInfo[]): ModelGroup[] {
  return Object.entries(groupBy(models, (model) => model.group ?? '')).map(([name, members]) => ({
    name,
    models: members,
  }))
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

function ModelList(props: {
  label: string
  models: readonly HarnessModelInfo[]
  value: string | null
  onSelect: (model: string) => void
}): JSX.Element {
  const [local] = splitProps(props, ['label', 'models', 'value', 'onSelect'])
  const collection = createMemo(() =>
    createListCollection({
      items: [...local.models],
      itemToValue: (model) => model.id,
      itemToString: (model) => model.name,
      isItemDisabled: (model) => model.disabled === true,
    }),
  )
  return (
    <Listbox.Root
      collection={collection()}
      value={local.value === null ? [] : [local.value]}
      defaultHighlightedValue={local.models.some((model) => model.id === local.value) ? local.value : null}
      onSelect={(details) => local.onSelect(details.value)}
    >
      <Listbox.Label class="sr-only">{local.label}</Listbox.Label>
      <Listbox.Content>
        <For each={collection().items}>
          {(model) => (
            <Listbox.Item item={model}>
              <span class={ROW_BODY}>
                <Listbox.ItemText class={ROW_NAME}>{model.name}</Listbox.ItemText>
                <Show when={model.description}>
                  {(description) => <span class={ROW_DESCRIPTION}>{description()}</span>}
                </Show>
              </span>
              <span class={ROW_END}>
                <Listbox.ItemIndicator>
                  <Check class="size-4 block" aria-hidden="true" />
                </Listbox.ItemIndicator>
              </span>
            </Listbox.Item>
          )}
        </For>
      </Listbox.Content>
    </Listbox.Root>
  )
}

function EffortSection(props: {
  efforts: readonly ReasoningEffort[]
  value: ReasoningEffort | null
  onSelect: (effort: ReasoningEffort) => void
}): JSX.Element {
  const [local] = splitProps(props, ['efforts', 'value', 'onSelect'])
  const select = (value: string | null) => {
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
        value={local.value}
        onValueChange={(details) => select(details.value)}
        aria-label={EFFORT_LABEL}
      >
        <SegmentGroup.Indicator />
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

function OlderModels(props: {group: ModelGroup; value: string | null; onSelect: (model: string) => void}): JSX.Element {
  const [local] = splitProps(props, ['group', 'value', 'onSelect'])
  const holdsValue = () => local.group.models.some((model) => model.id === local.value)
  return (
    <Collapsible.Root defaultOpen={holdsValue()}>
      <Collapsible.Trigger class={GROUP_TRIGGER}>
        <span class={ROW_BODY}>
          <span class={ROW_NAME}>{local.group.name}</span>
        </span>
        <ChevronRight class={GROUP_CHEVRON} aria-hidden="true" />
      </Collapsible.Trigger>
      <Collapsible.Content>
        <div class={OLDER_LIST}>
          <ModelList
            label={local.group.name}
            models={local.group.models}
            value={local.value}
            onSelect={local.onSelect}
          />
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}

export function useModelMenu(onClose: () => void): PopoverMachine {
  return usePopover({
    positioning: {placement: 'top-start'},
    onOpenChange: (details) => {
      if (!details.open) onClose()
    },
  })
}

type SessionModelPromptProps = {
  sessionId: string
  menu: PopoverMachine
}

export function SessionModelPrompt(props: SessionModelPromptProps): JSX.Element {
  return (
    <div class={PROMPT_SLOT}>
      <Suspense>
        <SessionModelMenu sessionId={props.sessionId} menu={props.menu} />
      </Suspense>
      <span class={PROMPT_FONT}>
        <Glyph />
      </span>
    </div>
  )
}

function SessionModelMenu(props: SessionModelPromptProps): JSX.Element {
  const appData = useAppData()
  const rpc = useRpc()
  const announce = useAnnounce()
  const meta = useQuery(() => appData.utils.meta.models.queryOptions())
  const queryClient = useQueryClient()
  const sessions = useQuery(() => appData.utils.sessions.list.queryOptions())
  const refetchSessions = () => queryClient.invalidateQueries({queryKey: appData.utils.sessions.list.key()})
  const setModel = useMutation(() => ({
    mutationFn: (model: string) => rpc.sessions.model({sessionId: props.sessionId, model}),
    onError: () => announce(SWITCH_FAILED, true),
    onSettled: refetchSessions,
  }))
  const setEffort = useMutation(() => ({
    mutationFn: (effort: ReasoningEffort | null) => rpc.sessions.effort({sessionId: props.sessionId, effort}),
    onError: () => announce(EFFORT_SWITCH_FAILED, true),
    onSettled: refetchSessions,
  }))

  const models = () => meta.data?.models ?? []
  const row = () => (sessions.data ?? []).find((session) => session.id === props.sessionId)
  const value = () =>
    (setModel.isPending ? setModel.variables : undefined) ?? row()?.model ?? meta.data?.defaultModel ?? null
  const current = createMemo(() => models().find((model) => model.id === value()))
  const effort = createMemo(() => {
    const stored = setEffort.isPending ? (setEffort.variables ?? null) : (row()?.effort ?? null)
    return stored !== null && current()?.efforts?.includes(stored) ? stored : null
  })
  const groups = createMemo(() => modelGroups(models()))
  const failed = () => meta.isError && models().length === 0
  const select = (model: string) => {
    if (model !== value()) setModel.mutate(model)
    props.menu().setOpen(false)
  }
  const selectEffort = (next: ReasoningEffort) => {
    if (next === effort()) return
    setEffort.mutate(next)
  }
  createEffect(
    on(
      () => meta.isError,
      (isError) => {
        if (isError) announce(MODELS_UNAVAILABLE)
      },
    ),
  )

  return (
    <Show when={failed() || models().length > 0}>
      <Popover.RootProvider value={props.menu} lazyMount unmountOnExit>
        <Popover.Trigger
          asChild={(triggerProps) => (
            <Button
              {...triggerProps()}
              variant="plain"
              size="none"
              class={PROMPT}
              aria-label={failed() ? MODELS_UNAVAILABLE : promptAriaLabel(current(), value(), effort())}
            >
              <Show when={!failed()} fallback={<RotateCw class="size-3.5 block text-chat-text-3" aria-hidden="true" />}>
                <Show when={promptLabel(current(), value())} keyed>
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
                <Button variant="plain" size="none" class={RETRY} onClick={() => void meta.refetch()}>
                  <RotateCw class="size-4 block" aria-hidden="true" />
                  {`${MODELS_UNAVAILABLE}: ${RETRY_LABEL}`}
                </Button>
              </Match>
              <Match when={groups()[0]}>
                {(first) => (
                  <>
                    <ModelList label={MENU_LABEL} models={first().models} value={value()} onSelect={select} />
                    <Show when={groups().length > 1}>
                      <div class={SEPARATOR} />
                    </Show>
                    <For each={groups().slice(1)}>
                      {(group) => <OlderModels group={group} value={value()} onSelect={select} />}
                    </For>
                    <Show when={current()?.efforts}>
                      {(efforts) => (
                        <>
                          <div class={SEPARATOR} />
                          <EffortSection efforts={efforts()} value={effort()} onSelect={selectEffort} />
                        </>
                      )}
                    </Show>
                  </>
                )}
              </Match>
            </Switch>
          </Popover.Content>
        </Popover.Positioner>
      </Popover.RootProvider>
    </Show>
  )
}
