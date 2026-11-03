import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  on,
  Show,
  splitProps,
  Suspense,
  Switch,
  type JSX,
} from 'solid-js'
import {useQuery, useMutation} from '@tanstack/solid-query'
import {groupBy, partition} from 'es-toolkit'
import {useFilter} from '@ark-ui/solid/locale'
import {
  Button,
  Combobox,
  createListCollection,
  LIST_PANEL,
  LIST_PANEL_GROUP_LABEL,
  LIST_PANEL_ITEM,
  LIST_PANEL_MESSAGE,
  SegmentGroup,
} from '@conciv/ui-kit-system'
import {getHostApi} from '@conciv/extension/host'
import RotateCw from 'lucide-solid/icons/rotate-cw'
import Check from 'lucide-solid/icons/check'
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
const RETRY_LABEL = 'Retry loading models'
const SWITCH_FAILED = 'Could not switch model'
const MENU_LABEL = 'Model'
const SEARCH_LABEL = 'Search models'
const EFFORT_LABEL = 'Effort'
const EFFORT_SWITCH_FAILED = 'Could not switch effort'
const DEFAULT_EFFORT = 'default'
const MAIN_ROWS = 4
const EFFORT_SHORT: Record<ReasoningEffort, string> = {
  low: 'low',
  medium: 'med',
  high: 'high',
  xhigh: 'xhigh',
  max: 'max',
}
const MODEL_COUNT = new Intl.NumberFormat(undefined)
const MODEL_PLURAL = new Intl.PluralRules(undefined)

const PROMPT_FONT = '[font-family:var(--chat-mono)] text-[13px] leading-[1.45]'
const PROMPT_SLOT = 'flex-none flex items-center min-w-[10ch] min-h-7 select-none'
const PROMPT = `inline-flex items-center gap-[6px] min-h-7 -ms-1.5 px-1.5 rounded-[var(--chat-radius-sm)] focus-ring trans-bg hover:bg-chat-fill-strong data-[state=open]:bg-chat-fill-strong ${PROMPT_FONT}`
const PROMPT_MODEL = 'max-w-[32ch] truncate text-chat-text-3'
const PROMPT_GLYPH = 'text-chat-accent'
const PANEL = `${LIST_PANEL} w-96 max-w-[var(--available-width)] max-h-[min(28rem,var(--available-height))] flex-col hidden data-[state=open]:flex data-[state=open]:anim-combo`
const SEARCH_ROW = 'flex items-center gap-2 px-2.5 pb-1 mb-1 border-b border-b-chat-line-soft text-chat-text-3'
const SEARCH_INPUT =
  'flex-1 min-w-0 h-8 bg-transparent [border:none] text-[0.8125rem] text-chat-text placeholder:text-chat-text-3 focus:outline-none'
const LIST = 'flex-1 min-h-0 overflow-y-auto overscroll-contain'
const ROW = `${LIST_PANEL_ITEM} data-[highlighted]:bg-chat-fill-strong data-[highlighted]:text-chat-text data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed`
const SLOT = 'size-5 shrink-0 grid place-items-center'
const ROW_TEXT = 'flex-1 min-w-0 truncate'
const HINT = `${LIST_PANEL_MESSAGE} text-[0.75rem]`
const EFFORT_ROW = 'flex flex-col gap-1 pt-1 mt-1 px-1 pb-0.5 border-t border-t-chat-line-soft'

type MenuRow = {harness: HarnessMenuEntry; model: HarnessModelInfo; value: string; label: string}
type HarnessSection = {harness: HarnessMenuEntry; label: string; main: MenuRow[]; rest: MenuRow[]}
type VisibleSection = {section: HarnessSection; rows: MenuRow[]}
type SwitchTarget = {harness: HarnessMenuEntry; model: HarnessModelInfo; label: string}

export type ModelMenu = {open: () => boolean; setOpen: (open: boolean) => void}

function rowValue(harnessId: string, modelId: string): string {
  return `${harnessId}:${modelId}`
}

function modelLabel(model: HarnessModelInfo, harness: HarnessMenuEntry, named: boolean): string {
  return named ? `${model.name} (${harness.name})` : model.name
}

function menuRow(harness: HarnessMenuEntry, model: HarnessModelInfo, named: boolean): MenuRow {
  return {harness, model, value: rowValue(harness.id, model.id), label: modelLabel(model, harness, named)}
}

function mainAndMore(
  models: HarnessModelInfo[],
  defaultModel: string | null,
): [HarnessModelInfo[], HarnessModelInfo[]] {
  if (models.length <= MAIN_ROWS) return [models, []]
  const newest = models.filter((model) => model.id !== defaultModel).slice(0, MAIN_ROWS - 1)
  return partition(models, (model) => model.id === defaultModel || newest.includes(model))
}

function harnessSection(harness: HarnessMenuEntry, named: boolean): HarnessSection {
  const [first, ...later] = Object.values(groupBy(harness.models, (model) => model.group ?? ''))
  const [main, more] = mainAndMore(first ?? [], harness.defaultModel)
  const toRows = (models: HarnessModelInfo[]) => models.map((model) => menuRow(harness, model, named))
  return {
    harness,
    label: named ? harness.name : MENU_LABEL,
    main: toRows(main),
    rest: toRows([...more, ...later.flat()]),
  }
}

function moreModelsLabel(count: number): string {
  return `${MODEL_COUNT.format(count)} more ${MODEL_PLURAL.select(count) === 'one' ? 'model' : 'models'}, type to search`
}

function promptLabel(
  model: HarnessModelInfo | undefined,
  id: string | null,
  effort: ReasoningEffort | null,
  harness: string | null,
): string {
  const modelName = model ? model.name.toLowerCase() : (id ?? '')
  const name = harness === null ? modelName : `${modelName} (${harness.toLowerCase()})`
  return effort === null ? name : `${name} · ${EFFORT_SHORT[effort]}`
}

function promptAriaLabel(
  model: HarnessModelInfo | undefined,
  id: string | null,
  effort: ReasoningEffort | null,
  harness: string | null,
): string {
  const modelName = model?.name ?? id ?? ''
  const name = `${MENU_LABEL}: ${harness === null ? modelName : `${modelName} (${harness})`}`
  return effort === null ? name : `${name}, effort ${effort}`
}

function Glyph(): JSX.Element {
  return (
    <span class={PROMPT_GLYPH} aria-hidden="true">
      ❯
    </span>
  )
}

function PlainPrompt(): JSX.Element {
  return (
    <span class={PROMPT_FONT}>
      <Glyph />
    </span>
  )
}

function EffortRow(props: {
  efforts: readonly ReasoningEffort[]
  value: ReasoningEffort | null
  onSelect: (effort: ReasoningEffort | null) => void
}): JSX.Element {
  const [local] = splitProps(props, ['efforts', 'value', 'onSelect'])
  const select = (value: string | null) => {
    const parsed = ReasoningEffortSchema.safeParse(value)
    local.onSelect(parsed.success ? parsed.data : null)
  }
  return (
    <div class={EFFORT_ROW}>
      <span class={LIST_PANEL_GROUP_LABEL} aria-hidden="true">
        {EFFORT_LABEL}
      </span>
      <SegmentGroup.Root
        class="w-full"
        aria-label={EFFORT_LABEL}
        value={local.value ?? DEFAULT_EFFORT}
        onValueChange={(details) => select(details.value)}
      >
        <SegmentGroup.Indicator />
        <For each={[DEFAULT_EFFORT, ...local.efforts]}>
          {(level) => {
            const parsed = ReasoningEffortSchema.safeParse(level)
            return (
              <SegmentGroup.Item class="flex-1" value={level}>
                <SegmentGroup.ItemText>{parsed.success ? EFFORT_SHORT[parsed.data] : level}</SegmentGroup.ItemText>
                <SegmentGroup.ItemHiddenInput />
              </SegmentGroup.Item>
            )
          }}
        </For>
      </SegmentGroup.Root>
    </div>
  )
}

function SectionGroup(props: {visible: VisibleSection; searching: boolean}): JSX.Element {
  const section = () => props.visible.section
  const hidden = () => (props.searching ? 0 : section().rest.length)
  const unusable = () => section().harness.models.length === 0 && !section().harness.modelsFailed
  return (
    <Combobox.ItemGroup>
      <Combobox.ItemGroupLabel class={LIST_PANEL_GROUP_LABEL}>{section().label}</Combobox.ItemGroupLabel>
      <For each={props.visible.rows}>
        {(row) => (
          <Combobox.Item item={row} class={ROW}>
            <span class={SLOT}>
              <Combobox.ItemIndicator>
                <Check class="size-4 block" aria-hidden="true" />
              </Combobox.ItemIndicator>
            </span>
            <Combobox.ItemText class={ROW_TEXT}>{row.label}</Combobox.ItemText>
          </Combobox.Item>
        )}
      </For>
      <Show when={hidden() > 0}>
        <p class={HINT}>{moreModelsLabel(hidden())}</p>
      </Show>
      <Show when={unusable()}>
        <p class={HINT}>{`${section().harness.name} has no usable models`}</p>
      </Show>
    </Combobox.ItemGroup>
  )
}

export function useModelMenu(onClose: () => void): ModelMenu {
  const [open, setOpen] = createSignal(false)
  return {
    open,
    setOpen: (next) => {
      setOpen(next)
      if (!next) onClose()
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
      <Suspense fallback={<PlainPrompt />}>
        <SessionModelMenu sessionId={props.sessionId} menu={props.menu} running={props.running} />
      </Suspense>
    </div>
  )
}

const CHARACTERS_PER_TOKEN = 4
const TOKEN_COUNT = new Intl.NumberFormat(undefined)
const TOKEN_PLURAL = new Intl.PluralRules(undefined)

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

function SessionModelMenu(props: SessionModelPromptProps): JSX.Element {
  const appData = useAppData()
  const rpc = useRpc()
  const announce = useAnnounce()
  const notices = useNotices()
  const pane = usePane()
  const Dialog = getHostApi().useDialog()
  const refetchSessionHarness = useRefetchSessionHarness()
  const filter = useFilter({sensitivity: 'base'})
  const own = useSessionModels(() => props.sessionId)
  const catalog = useQuery(() => appData.utils.meta.harnesses.queryOptions())
  const sessions = useQuery(() => appData.utils.sessions.list.queryOptions())
  const [confirming, setConfirming] = createSignal<SwitchTarget | null>(null)
  const [query, setQuery] = createSignal('')
  let searchField: HTMLInputElement | undefined
  const setModel = useMutation(() => ({
    mutationFn: (model: string) => rpc.sessions.model({sessionId: props.sessionId, model}),
    onError: () => announce(SWITCH_FAILED, true),
    onSettled: () => appData.invalidateSessions(),
  }))
  const setEffort = useMutation(() => ({
    mutationFn: (effort: ReasoningEffort | null) => rpc.sessions.effort({sessionId: props.sessionId, effort}),
    onError: () => announce(EFFORT_SWITCH_FAILED, true),
    onSettled: () => appData.invalidateSessions(),
  }))
  const switchHarness = useMutation(() => ({
    mutationFn: (target: SwitchTarget) =>
      rpc.sessions.switchHarness({sessionId: props.sessionId, harnessId: target.harness.id, model: target.model.id}),
    onSuccess: async (_switched: {harnessId: string}, target: SwitchTarget) => {
      const [, refreshed] = await Promise.allSettled([refetchSessionHarness(props.sessionId), pane.chat().refresh()])
      announce(`Switched to ${target.label}.`)
      if (refreshed.status === 'rejected')
        notices.notify('Couldn’t refresh the conversation. Refresh it to see which harness wrote each reply.', {
          tone: 'warn',
        })
    },
    onError: (error: unknown, target: SwitchTarget) => notices.notify(switchFailure(error, target), {tone: 'warn'}),
  }))

  const ownEntry = createMemo((): HarnessMenuEntry | undefined =>
    own.data === undefined
      ? undefined
      : {...own.data.harness, models: own.data.models, defaultModel: own.data.defaultModel, modelsFailed: false},
  )
  const entries = createMemo((): HarnessMenuEntry[] => {
    const listed = catalog.isSuccess ? catalog.data.harnesses : []
    const mine = ownEntry()
    if (mine === undefined) return listed
    if (!listed.some((entry) => entry.id === mine.id)) return [mine, ...listed]
    return listed.map((entry) => (entry.id === mine.id ? mine : entry))
  })
  const named = () => entries().length > 1
  const row = () => (sessions.data ?? []).find((session) => session.id === props.sessionId)
  const harness = () => entries().find((entry) => entry.id === ownEntry()?.id)
  const models = () => harness()?.models ?? []
  const value = () => row()?.model ?? harness()?.defaultModel ?? null
  const current = createMemo(() => models().find((model) => model.id === value()))
  const harnessName = () => (named() ? (harness()?.name ?? null) : null)
  const effort = createMemo(() => {
    const stored = row()?.effort ?? null
    return stored !== null && current()?.efforts?.includes(stored) ? stored : null
  })
  const sections = createMemo(() =>
    entries()
      .filter((entry) => !entry.modelsFailed)
      .map((entry) => harnessSection(entry, named())),
  )
  const matches = (candidate: MenuRow, text: string) =>
    [candidate.model.name, candidate.model.id, candidate.harness.name].some((field) => filter().contains(field, text))
  const visibleSections = createMemo((): VisibleSection[] => {
    const text = query().trim()
    if (text === '') return sections().map((section) => ({section, rows: section.main}))
    return sections()
      .map((section) => ({section, rows: [...section.main, ...section.rest].filter((found) => matches(found, text))}))
      .filter((visible) => visible.rows.length > 0)
  })
  const unavailable = () => entries().filter((entry) => entry.modelsFailed && entry.id !== harness()?.id)
  const selected = () => {
    const owner = harness()
    const id = value()
    return owner === undefined || id === null ? [] : [rowValue(owner.id, id)]
  }
  const failed = () => own.isError && models().length === 0
  const foreignDisabled = (candidate: MenuRow) =>
    candidate.harness.id !== harness()?.id && (props.running || switchHarness.isPending)
  const collection = createMemo(() =>
    createListCollection<MenuRow>({
      items: visibleSections().flatMap((visible) => visible.rows),
      itemToValue: (item) => item.value,
      itemToString: (item) => item.label,
      isItemDisabled: (item) => item.model.disabled === true || foreignDisabled(item),
    }),
  )
  const switchTo = (target: SwitchTarget) => {
    if (pane.chat().messages().length > 0) {
      setConfirming(target)
      return
    }
    props.menu.setOpen(false)
    switchHarness.mutate(target)
  }
  const confirm = (target: SwitchTarget) => {
    setConfirming(null)
    switchHarness.mutate(target)
  }
  const select = (picked: MenuRow | null) => {
    if (picked === null) return
    if (picked.harness.id !== harness()?.id) {
      switchTo({harness: picked.harness, model: picked.model, label: modelLabel(picked.model, picked.harness, true)})
      return
    }
    props.menu.setOpen(false)
    if (picked.model.id === value()) return
    setModel.mutate(picked.model.id)
  }
  const selectEffort = (next: ReasoningEffort | null) => {
    if (next === effort()) return
    setEffort.mutate(next)
  }
  const changeOpen = (open: boolean, reason: string | undefined) => {
    if (!open && reason === 'escape-key' && query() !== '') {
      setQuery('')
      return
    }
    if (!open) setQuery('')
    props.menu.setOpen(open)
  }
  createEffect(
    on(
      () => own.isError,
      (isError) => {
        if (isError) announce(MODELS_UNAVAILABLE)
      },
    ),
  )
  createEffect(
    on(
      () => props.menu.open(),
      (open) => {
        if (open) requestAnimationFrame(() => searchField?.focus())
      },
      {defer: true},
    ),
  )

  return (
    <>
      <Show when={failed() || models().length > 0} fallback={<PlainPrompt />}>
        <Combobox.Root
          collection={collection()}
          value={selected()}
          inputValue={query()}
          open={props.menu.open()}
          onOpenChange={(details) => changeOpen(details.open, details.reason)}
          onInputValueChange={(details) => setQuery(details.inputValue)}
          onSelect={(details) => select(collection().find(details.itemValue))}
          closeOnSelect={false}
          composite={false}
          inputBehavior="autohighlight"
          selectionBehavior="clear"
          loopFocus
          positioning={{placement: 'top-start', strategy: 'fixed', gutter: 4}}
        >
          <Combobox.Trigger
            focusable
            asChild={(triggerProps) => (
              <Button
                {...triggerProps()}
                variant="plain"
                size="none"
                class={PROMPT}
                aria-label={
                  failed() ? MODELS_UNAVAILABLE : promptAriaLabel(current(), value(), effort(), harnessName())
                }
              >
                <Show when={!failed()}>
                  <span class={PROMPT_MODEL}>{promptLabel(current(), value(), effort(), harnessName())}</span>
                </Show>
                <Glyph />
              </Button>
            )}
          />
          <Combobox.Positioner>
            <Combobox.Content class={PANEL}>
              <Combobox.Label class="sr-only">{MENU_LABEL}</Combobox.Label>
              <Switch>
                <Match when={failed()}>
                  <div class="flex items-center justify-between gap-2 px-2.5 py-1.5" role="status">
                    <span class="text-[0.8125rem] text-chat-text-3">{MODELS_UNAVAILABLE}</span>
                    <Button variant="outline" size="sm" onClick={() => void own.refetch()}>
                      <RotateCw class="size-3.5 block" aria-hidden="true" />
                      {RETRY_LABEL}
                    </Button>
                  </div>
                </Match>
                <Match when={!failed()}>
                  <div class={SEARCH_ROW}>
                    <Search class="size-4 block shrink-0" aria-hidden="true" />
                    <Combobox.Input
                      class={SEARCH_INPUT}
                      aria-label={SEARCH_LABEL}
                      placeholder={SEARCH_LABEL}
                      ref={(element) => (searchField = element)}
                      onPointerDown={(event) => event.stopPropagation()}
                    />
                  </div>
                  <Combobox.List class={LIST}>
                    <For each={visibleSections()}>
                      {(visible) => <SectionGroup visible={visible} searching={query().trim() !== ''} />}
                    </For>
                  </Combobox.List>
                  <Show when={query().trim() !== '' && collection().size === 0}>
                    <p class={LIST_PANEL_MESSAGE} role="status">{`No models match “${query().trim()}”`}</p>
                  </Show>
                  <For each={unavailable()}>
                    {(entry) => (
                      <Button
                        variant="ghost"
                        size="none"
                        class={`${LIST_PANEL_ITEM} w-full justify-start`}
                        onClick={() => void catalog.refetch()}
                      >
                        <RotateCw class="size-4 block" aria-hidden="true" />
                        {`Couldn’t load ${entry.name} models: ${RETRY_LABEL}`}
                      </Button>
                    )}
                  </For>
                  <Show when={catalog.isError}>
                    <Button
                      variant="ghost"
                      size="none"
                      class={`${LIST_PANEL_ITEM} w-full justify-start`}
                      onClick={() => void catalog.refetch()}
                    >
                      <RotateCw class="size-4 block" aria-hidden="true" />
                      {`Couldn’t load the other harnesses: ${RETRY_LABEL}`}
                    </Button>
                  </Show>
                  <Show when={current()?.efforts}>
                    {(efforts) => <EffortRow efforts={efforts()} value={effort()} onSelect={selectEffort} />}
                  </Show>
                </Match>
              </Switch>
            </Combobox.Content>
          </Combobox.Positioner>
        </Combobox.Root>
      </Show>
      <Show when={confirming()}>
        {(target) => (
          <Dialog
            open
            onOpenChange={(open) => {
              if (!open) setConfirming(null)
            }}
            title="Switch harness?"
            role="alertdialog"
            layer="inline"
            dismissable
            footer={
              <div class="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setConfirming(null)}>
                  Cancel
                </Button>
                <Button onClick={() => confirm(target())}>Switch to {target().harness.name}</Button>
              </div>
            }
          >
            <p class="text-[0.8125rem] text-chat-text m-0">
              Switching to {target().harness.name} sends this chat’s history (about{' '}
              {tokensLabel(estimatedTokens(pane.chat().messages()))}).
            </p>
          </Dialog>
        )}
      </Show>
    </>
  )
}
