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
import {Button, LIST_PANEL_ITEM, Menu, useMenu, type MenuMachine} from '@conciv/ui-kit-system'
import {getHostApi} from '@conciv/extension/host'
import RotateCw from 'lucide-solid/icons/rotate-cw'
import Check from 'lucide-solid/icons/check'
import ChevronRight from 'lucide-solid/icons/chevron-right'
import {
  ReasoningEffortSchema,
  type HarnessMenuEntry,
  type HarnessModelInfo,
  type ReasoningEffort,
} from '@conciv/protocol/chat-types'
import type {ChatMessage} from '@conciv/protocol/chat-message-types'
import {useAnnounce, useAppData, useRpc} from '../app/context.js'
import {usePane} from '../app/pane-context.js'
import {useRefetchSessionHarness} from '../data/harness-meta.js'
import {useNotices} from '../shell/notice-context.js'
import {rpcErrorCode} from '../shell/rpc-error-message.js'

const MODELS_UNAVAILABLE = 'Couldn’t load models'
const RETRY_LABEL = 'Retry loading models'
const SWITCH_FAILED = 'Could not switch model'
const MENU_LABEL = 'Model'
const EFFORT_LABEL = 'Effort'
const EFFORT_SWITCH_FAILED = 'Could not switch effort'
const DEFAULT_EFFORT = 'default'
const MORE_MODELS = 'More models'
const MAIN_ROWS = 4
const EFFORT_SHORT: Record<ReasoningEffort, string> = {
  low: 'low',
  medium: 'med',
  high: 'high',
  xhigh: 'xhigh',
  max: 'max',
}

const PROMPT_FONT = '[font-family:var(--chat-mono)] text-[13px] leading-[1.45]'
const PROMPT_SLOT = 'flex-none flex items-center min-w-[10ch] min-h-7 select-none'
const PROMPT = `inline-flex items-center gap-[6px] min-h-7 -ms-1.5 px-1.5 rounded-[var(--chat-radius-sm)] focus-ring trans-bg hover:bg-chat-fill-strong data-[state=open]:bg-chat-fill-strong ${PROMPT_FONT}`
const PROMPT_MODEL = 'max-w-[32ch] truncate text-chat-text-3'
const PROMPT_GLYPH = 'text-chat-accent'
const ROW = `${LIST_PANEL_ITEM} data-[highlighted]:bg-chat-fill-strong data-[highlighted]:text-chat-text data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed`
const SLOT = 'size-5 shrink-0 grid place-items-center'
const ROW_TEXT = 'flex-1 min-w-0 truncate'
const EFFORT_ROW = 'flex items-center gap-1 pe-0.5'
const SEGMENTS =
  'flex flex-1 items-center gap-0.5 p-0.5 rounded-chat-surface-sm bg-chat-fill-soft [border:1px_solid_var(--chat-line)]'
const SEGMENT =
  'flex-1 inline-flex items-center justify-center min-h-7 px-1.5 rounded-chat-surface-sm [border:1px_solid_transparent] [font-family:var(--chat-mono)] text-[0.75rem] text-chat-text-3 whitespace-nowrap cursor-pointer select-none outline-none trans-color-bg data-[highlighted]:bg-chat-fill-strong data-[highlighted]:text-chat-text data-[state=checked]:bg-chat-panel data-[state=checked]:[border-color:var(--chat-line-2)] data-[state=checked]:shadow-chat-sm data-[state=checked]:text-chat-text-hi'

type MenuRow = {harness: HarnessMenuEntry; model: HarnessModelInfo; value: string; label: string}
type RowGroup = {name: string; rows: MenuRow[]}
type HarnessSection = {harness: HarnessMenuEntry; label: string; main: MenuRow[]; submenus: RowGroup[]}
type SwitchTarget = {harness: HarnessMenuEntry; model: HarnessModelInfo; label: string}

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
  const groups = Object.entries(groupBy(harness.models, (model) => model.group ?? ''))
  const [first, ...later] = groups
  const [main, more] = mainAndMore(first?.[1] ?? [], harness.defaultModel)
  const toRows = (models: HarnessModelInfo[]) => models.map((model) => menuRow(harness, model, named))
  const submenus = [
    ...(more.length > 0 ? [{name: MORE_MODELS, rows: toRows(more)}] : []),
    ...later.map(([name, models]) => ({name, rows: toRows(models)})),
  ]
  return {harness, label: named ? harness.name : MENU_LABEL, main: toRows(main), submenus}
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

type RowsProps = {
  rows: readonly MenuRow[]
  value: string
  disabled: (row: MenuRow) => boolean
  onSelect: (row: MenuRow) => void
}

function ModelRows(props: RowsProps): JSX.Element {
  const [local] = splitProps(props, ['rows', 'value', 'disabled', 'onSelect'])
  const select = (value: string) => {
    const row = local.rows.find((candidate) => candidate.value === value)
    if (row) local.onSelect(row)
  }
  return (
    <Menu.RadioItemGroup value={local.value} onValueChange={(details) => select(details.value)}>
      <For each={local.rows}>
        {(row) => (
          <Menu.RadioItem
            class={ROW}
            value={row.value}
            valueText={row.label}
            disabled={row.model.disabled || local.disabled(row)}
            title={row.model.description}
          >
            <span class={SLOT}>
              <Menu.ItemIndicator>
                <Check class="size-4 block" aria-hidden="true" />
              </Menu.ItemIndicator>
            </span>
            <Menu.ItemText class={ROW_TEXT}>{row.label}</Menu.ItemText>
          </Menu.RadioItem>
        )}
      </For>
    </Menu.RadioItemGroup>
  )
}

function EffortRow(props: {
  efforts: readonly ReasoningEffort[]
  value: ReasoningEffort | null
  onSelect: (effort: ReasoningEffort | null) => void
}): JSX.Element {
  const [local] = splitProps(props, ['efforts', 'value', 'onSelect'])
  const select = (value: string) => {
    const parsed = ReasoningEffortSchema.safeParse(value)
    local.onSelect(parsed.success ? parsed.data : null)
  }
  return (
    <Menu.RadioItemGroup
      class={EFFORT_ROW}
      value={local.value ?? DEFAULT_EFFORT}
      onValueChange={(details) => select(details.value)}
    >
      <Menu.ItemGroupLabel>{EFFORT_LABEL}</Menu.ItemGroupLabel>
      <div class={SEGMENTS}>
        <For each={[DEFAULT_EFFORT, ...local.efforts]}>
          {(level) => {
            const parsed = ReasoningEffortSchema.safeParse(level)
            return (
              <Menu.RadioItem class={SEGMENT} value={level} valueText={level} closeOnSelect={false}>
                <Menu.ItemText>{parsed.success ? EFFORT_SHORT[parsed.data] : level}</Menu.ItemText>
              </Menu.RadioItem>
            )
          }}
        </For>
      </div>
    </Menu.RadioItemGroup>
  )
}

function ModelSubmenu(props: RowsProps & {name: string}): JSX.Element {
  const [local, rows] = splitProps(props, ['name'])
  const holdsValue = () => rows.rows.some((row) => row.value === rows.value)
  return (
    <Menu.Root positioning={{placement: 'right-start'}}>
      <Menu.TriggerItem class={ROW}>
        <span class={SLOT}>
          <Show when={holdsValue()}>
            <Check class="size-4 block" aria-hidden="true" />
          </Show>
        </span>
        <span class={ROW_TEXT}>{local.name}</span>
        <ChevronRight class="size-4 block shrink-0 text-chat-text-3" aria-hidden="true" />
      </Menu.TriggerItem>
      <Menu.Positioner>
        <Menu.Content>
          <ModelRows {...rows} />
        </Menu.Content>
      </Menu.Positioner>
    </Menu.Root>
  )
}

function SectionRows(props: Omit<RowsProps, 'rows'> & {section: HarnessSection}): JSX.Element {
  const [local, rows] = splitProps(props, ['section'])
  return (
    <>
      <Menu.ItemGroup>
        <Menu.ItemGroupLabel>{local.section.label}</Menu.ItemGroupLabel>
        <ModelRows {...rows} rows={local.section.main} />
      </Menu.ItemGroup>
      <For each={local.section.submenus}>
        {(group) => <ModelSubmenu {...rows} name={group.name} rows={group.rows} />}
      </For>
    </>
  )
}

export function useModelMenu(onClose: () => void): MenuMachine {
  return useMenu({
    positioning: {placement: 'top-start'},
    onOpenChange: (details) => {
      if (!details.open) onClose()
    },
  })
}

type SessionModelPromptProps = {
  sessionId: string
  menu: MenuMachine
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
  const catalog = useQuery(() => appData.utils.meta.harnesses.queryOptions())
  const sessions = useQuery(() => appData.utils.sessions.list.queryOptions())
  const [confirming, setConfirming] = createSignal<SwitchTarget | null>(null)
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

  const entries = () => catalog.data?.harnesses ?? []
  const named = () => entries().length > 1
  const row = () => (sessions.data ?? []).find((session) => session.id === props.sessionId)
  const harness = createMemo(() => {
    const harnessId = row()?.harnessKind ?? catalog.data?.defaultHarness
    return (
      entries().find((entry) => entry.id === harnessId) ??
      entries().find((entry) => entry.id === catalog.data?.defaultHarness)
    )
  })
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
      .filter((entry) => entry.models.length > 0)
      .map((entry) => harnessSection(entry, named())),
  )
  const unavailable = () => entries().filter((entry) => entry.modelsFailed && entry.id !== harness()?.id)
  const selected = () => {
    const owner = harness()
    const id = value()
    return owner === undefined || id === null ? '' : rowValue(owner.id, id)
  }
  const failed = () => catalog.isError || (harness()?.modelsFailed === true && models().length === 0)
  const foreignDisabled = (candidate: MenuRow) =>
    candidate.harness.id !== harness()?.id && (props.running || switchHarness.isPending)
  const switchTo = (target: SwitchTarget) => {
    if (pane.chat().messages().length === 0) {
      switchHarness.mutate(target)
      return
    }
    setConfirming(target)
  }
  const confirm = (target: SwitchTarget) => {
    setConfirming(null)
    switchHarness.mutate(target)
  }
  const select = (picked: MenuRow) => {
    if (picked.harness.id !== harness()?.id) {
      switchTo({harness: picked.harness, model: picked.model, label: modelLabel(picked.model, picked.harness, true)})
      return
    }
    if (picked.model.id === value()) return
    setModel.mutate(picked.model.id)
  }
  const selectEffort = (next: ReasoningEffort | null) => {
    if (next === effort()) return
    setEffort.mutate(next)
  }
  createEffect(
    on(
      () => catalog.isError,
      (isError) => {
        if (isError) announce(MODELS_UNAVAILABLE)
      },
    ),
  )

  return (
    <>
      <Show when={failed() || models().length > 0} fallback={<PlainPrompt />}>
        <Menu.RootProvider value={props.menu}>
          <Menu.Trigger
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
          <Menu.Positioner>
            <Menu.Content>
              <Switch>
                <Match when={failed()}>
                  <Menu.Item value="retry" onSelect={() => void catalog.refetch()}>
                    <RotateCw class="size-4 block" aria-hidden="true" />
                    {`${MODELS_UNAVAILABLE}: ${RETRY_LABEL}`}
                  </Menu.Item>
                </Match>
                <Match when={sections().length > 0}>
                  <For each={sections()}>
                    {(section, index) => (
                      <>
                        <Show when={index() > 0}>
                          <Menu.Separator class="border-none" />
                        </Show>
                        <SectionRows
                          section={section}
                          value={selected()}
                          disabled={foreignDisabled}
                          onSelect={select}
                        />
                      </>
                    )}
                  </For>
                  <For each={unavailable()}>
                    {(entry) => (
                      <Menu.Item value={`retry:${entry.id}`} class={ROW} onSelect={() => void catalog.refetch()}>
                        <RotateCw class="size-4 block" aria-hidden="true" />
                        {`Couldn’t load ${entry.name} models: ${RETRY_LABEL}`}
                      </Menu.Item>
                    )}
                  </For>
                  <Show when={current()?.efforts}>
                    {(efforts) => (
                      <>
                        <Menu.Separator class="border-none" />
                        <EffortRow efforts={efforts()} value={effort()} onSelect={selectEffort} />
                      </>
                    )}
                  </Show>
                </Match>
              </Switch>
            </Menu.Content>
          </Menu.Positioner>
        </Menu.RootProvider>
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
