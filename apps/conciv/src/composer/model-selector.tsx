import {createEffect, createMemo, For, Match, on, Show, splitProps, Suspense, Switch, type JSX} from 'solid-js'
import {useQuery, useMutation} from '@tanstack/solid-query'
import {groupBy} from 'es-toolkit'
import {Button, LIST_PANEL_ITEM, Menu} from '@conciv/ui-kit-system'
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
const EFFORT_SWITCH_FAILED = 'Could not switch effort'
const DEFAULT_EFFORT = 'default'
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
const PROMPT_MODEL = 'max-w-[22ch] truncate text-chat-text-3'
const PROMPT_GLYPH = 'text-chat-accent'
const ROW = `${LIST_PANEL_ITEM} data-[highlighted]:bg-chat-fill-strong data-[highlighted]:text-chat-text data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed`
const SLOT = 'size-5 shrink-0 grid place-items-center'
const ROW_TEXT = 'flex-1 min-w-0 truncate'
const EFFORT_ROW = 'flex items-center gap-1 pe-0.5'
const SEGMENTS =
  'flex flex-1 items-center gap-0.5 p-0.5 rounded-chat-surface-sm bg-chat-fill-soft [border:1px_solid_var(--chat-line)]'
const SEGMENT =
  'flex-1 inline-flex items-center justify-center min-h-7 px-1.5 rounded-chat-surface-sm [border:1px_solid_transparent] [font-family:var(--chat-mono)] text-[0.75rem] text-chat-text-3 whitespace-nowrap cursor-pointer select-none outline-none trans-color-bg data-[highlighted]:bg-chat-fill-strong data-[highlighted]:text-chat-text data-[state=checked]:bg-chat-panel data-[state=checked]:[border-color:var(--chat-line-2)] data-[state=checked]:shadow-chat-sm data-[state=checked]:text-chat-text-hi'

type ModelGroup = {name: string; models: HarnessModelInfo[]}

function promptLabel(model: HarnessModelInfo | undefined, id: string | null, effort: ReasoningEffort | null): string {
  const name = model ? model.name.toLowerCase() : (id ?? '')
  return effort === null ? name : `${name} · ${EFFORT_SHORT[effort]}`
}

function promptAriaLabel(
  model: HarnessModelInfo | undefined,
  id: string | null,
  effort: ReasoningEffort | null,
): string {
  const name = `${MENU_LABEL}: ${model?.name ?? id ?? ''}`
  return effort === null ? name : `${name}, effort ${effort}`
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

function PlainPrompt(): JSX.Element {
  return (
    <span class={PROMPT_FONT}>
      <Glyph />
    </span>
  )
}

function ModelRows(props: {
  models: readonly HarnessModelInfo[]
  value: string | null
  onSelect: (model: string) => void
}): JSX.Element {
  const [local] = splitProps(props, ['models', 'value', 'onSelect'])
  return (
    <Menu.RadioItemGroup value={local.value ?? ''} onValueChange={(details) => local.onSelect(details.value)}>
      <For each={local.models}>
        {(model) => (
          <Menu.RadioItem
            class={ROW}
            value={model.id}
            valueText={model.name}
            disabled={model.disabled}
            title={model.description}
          >
            <span class={SLOT}>
              <Menu.ItemIndicator>
                <Check class="size-4 block" aria-hidden="true" />
              </Menu.ItemIndicator>
            </span>
            <Menu.ItemText class={ROW_TEXT}>{model.name}</Menu.ItemText>
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

function ModelSubmenu(props: {
  group: ModelGroup
  value: string | null
  onSelect: (model: string) => void
}): JSX.Element {
  const [local] = splitProps(props, ['group', 'value', 'onSelect'])
  const holdsValue = () => local.group.models.some((model) => model.id === local.value)
  return (
    <Menu.Root positioning={{placement: 'right-start'}}>
      <Menu.TriggerItem class={ROW}>
        <span class={SLOT}>
          <Show when={holdsValue()}>
            <Check class="size-4 block" aria-hidden="true" />
          </Show>
        </span>
        <span class={ROW_TEXT}>{local.group.name}</span>
        <ChevronRight class="size-4 block shrink-0 text-chat-text-3" aria-hidden="true" />
      </Menu.TriggerItem>
      <Menu.Positioner>
        <Menu.Content>
          <ModelRows models={local.group.models} value={local.value} onSelect={local.onSelect} />
        </Menu.Content>
      </Menu.Positioner>
    </Menu.Root>
  )
}

export function SessionModelPrompt(props: {sessionId: string}): JSX.Element {
  const appData = useAppData()
  const rpc = useRpc()
  const announce = useAnnounce()
  const meta = useQuery(() => appData.utils.meta.models.queryOptions())
  const sessions = useQuery(() => appData.utils.sessions.list.queryOptions())
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

  const models = () => meta.data?.models ?? []
  const row = () => (sessions.data ?? []).find((session) => session.id === props.sessionId)
  const value = () => row()?.model ?? meta.data?.defaultModel ?? null
  const current = createMemo(() => models().find((model) => model.id === value()))
  const effort = createMemo(() => {
    const stored = row()?.effort ?? null
    return stored !== null && current()?.efforts?.includes(stored) ? stored : null
  })
  const groups = createMemo(() => modelGroups(models()))
  const failed = () => meta.isError && models().length === 0
  const select = (model: string) => {
    if (model === value()) return
    setModel.mutate(model)
  }
  const selectEffort = (next: ReasoningEffort | null) => {
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
    <div class={PROMPT_SLOT}>
      <Suspense fallback={<PlainPrompt />}>
        <Show when={failed() || models().length > 0} fallback={<PlainPrompt />}>
          <Menu.Root positioning={{placement: 'top-start'}}>
            <Menu.Trigger
              asChild={(triggerProps) => (
                <Button
                  {...triggerProps()}
                  variant="plain"
                  size="none"
                  class={PROMPT}
                  aria-label={failed() ? MODELS_UNAVAILABLE : promptAriaLabel(current(), value(), effort())}
                >
                  <Show when={!failed()}>
                    <span class={PROMPT_MODEL}>{promptLabel(current(), value(), effort())}</span>
                  </Show>
                  <Glyph />
                </Button>
              )}
            />
            <Menu.Positioner>
              <Menu.Content>
                <Switch>
                  <Match when={failed()}>
                    <Menu.Item value="retry" onSelect={() => void meta.refetch()}>
                      <RotateCw class="size-4 block" aria-hidden="true" />
                      {`${MODELS_UNAVAILABLE}: ${RETRY_LABEL}`}
                    </Menu.Item>
                  </Match>
                  <Match when={groups()[0]}>
                    {(first) => (
                      <>
                        <Menu.ItemGroup>
                          <Menu.ItemGroupLabel>{MENU_LABEL}</Menu.ItemGroupLabel>
                          <ModelRows models={first().models} value={value()} onSelect={select} />
                        </Menu.ItemGroup>
                        <Show when={groups().length > 1}>
                          <Menu.Separator class="border-none" />
                        </Show>
                        <For each={groups().slice(1)}>
                          {(group) => <ModelSubmenu group={group} value={value()} onSelect={select} />}
                        </For>
                        <Show when={current()?.efforts}>
                          {(efforts) => (
                            <>
                              <Menu.Separator class="border-none" />
                              <EffortRow efforts={efforts()} value={effort()} onSelect={selectEffort} />
                            </>
                          )}
                        </Show>
                      </>
                    )}
                  </Match>
                </Switch>
              </Menu.Content>
            </Menu.Positioner>
          </Menu.Root>
        </Show>
      </Suspense>
    </div>
  )
}
