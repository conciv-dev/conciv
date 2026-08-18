import {createEffect, createMemo, For, Match, on, Show, splitProps, Switch, type JSX} from 'solid-js'
import {useQuery, useMutation} from '@tanstack/solid-query'
import {Button} from '@conciv/ui-kit-system'
import RotateCw from 'lucide-solid/icons/rotate-cw'
import Check from 'lucide-solid/icons/check'
import {ComposerActions as Action, ModelSelector, useModelSelectorContext, type ModelOption} from '@conciv/ui-kit-chat'
import type {HarnessModelInfo} from '@conciv/protocol/chat-types'
import {useAnnounce, useAppData, useRpc} from '../app/context.js'

const MODELS_UNAVAILABLE = 'Couldn’t load models'
const RETRY_LABEL = 'Retry loading models'
const TOUCH = 'min-h-11 px-3'

function toOption(model: HarnessModelInfo): ModelOption {
  return {id: model.id, name: model.name, description: model.description, disabled: model.disabled}
}

function groupsOf(
  options: readonly ModelOption[],
  groupById: Map<string, string>,
): {name: string; items: ModelOption[]}[] {
  const order: string[] = []
  const byGroup = new Map<string, ModelOption[]>()
  for (const option of options) {
    const group = groupById.get(option.id) ?? 'Models'
    const bucket = byGroup.get(group)
    if (bucket) bucket.push(option)
    else {
      byGroup.set(group, [option])
      order.push(group)
    }
  }
  return order.map((name) => ({name, items: byGroup.get(name) ?? []}))
}

function GroupedModelList(props: {models: ReadonlyArray<HarnessModelInfo>}): JSX.Element {
  const context = useModelSelectorContext()
  const groupById = createMemo(() => new Map(props.models.map((model) => [model.id, model.group ?? 'Models'])))
  return (
    <Show
      when={context.filteredModels().length > 0}
      fallback={<div class="text-xs text-pw-text-3 px-2 py-2.5">No models match</div>}
    >
      <For each={groupsOf(context.filteredModels(), groupById())}>
        {(group) => (
          <ModelSelector.Group label={group.name}>
            <For each={group.items}>{(model) => <ModelSelector.Item model={model} />}</For>
          </ModelSelector.Group>
        )}
      </For>
    </Show>
  )
}

export function ModelSelectorView(props: {
  models: ReadonlyArray<HarnessModelInfo>
  value: string | null
  failed: boolean
  retrying: boolean
  onRetry: () => void
  onSelect: (model: string) => void
}): JSX.Element {
  const [local] = splitProps(props, ['models', 'value', 'failed', 'retrying', 'onRetry', 'onSelect'])
  const options = createMemo(() => local.models.map(toOption))
  return (
    <Switch>
      <Match when={local.failed && local.models.length === 0}>
        <Button
          variant="outline"
          size="sm"
          class={`shrink-0 gap-1.5 ${TOUCH}`}
          aria-label={RETRY_LABEL}
          aria-busy={local.retrying}
          onClick={() => local.onRetry()}
        >
          <RotateCw class="size-4 block" aria-hidden="true" />
          {MODELS_UNAVAILABLE}
        </Button>
      </Match>
      <Match when={local.models.length > 0}>
        <ModelSelector.Root
          models={options()}
          value={local.value ?? undefined}
          onValueChange={(id) => local.onSelect(id)}
        >
          <ModelSelector.Trigger />
          <ModelSelector.Content>
            <ModelSelector.Search placeholder="Search models…" />
            <div class="flex-1 overflow-y-auto">
              <GroupedModelList models={local.models} />
            </div>
            <ModelSelector.Effort />
          </ModelSelector.Content>
        </ModelSelector.Root>
      </Match>
    </Switch>
  )
}

export function SessionModelSelector(props: {sessionId: string}): JSX.Element {
  const appData = useAppData()
  const rpc = useRpc()
  const announce = useAnnounce()
  const meta = useQuery(() => appData.utils.meta.models.queryOptions())
  const sessions = useQuery(() => appData.utils.sessions.list.queryOptions())
  const setModel = useMutation(() => ({
    mutationFn: (model: string) => rpc.sessions.model({sessionId: props.sessionId, model}),
    onError: () => announce('Could not switch model', true),
    onSettled: () => appData.invalidateSessions(),
  }))

  const models = () => meta.data?.models ?? []
  const value = () => {
    const row = (sessions.data ?? []).find((session) => session.id === props.sessionId)
    return row?.model ?? meta.data?.defaultModel ?? null
  }
  createEffect(
    on(
      () => meta.isError,
      (failed) => {
        if (failed) announce(MODELS_UNAVAILABLE)
      },
    ),
  )

  return (
    <Action.Action priority={5} disabled={() => meta.isPending}>
      <Show
        when={!(meta.isError && models().length === 0)}
        fallback={
          <Action.ActionMenuItem label={`${MODELS_UNAVAILABLE}: ${RETRY_LABEL}`} onSelect={() => void meta.refetch()}>
            <RotateCw class="size-4 block" aria-hidden="true" />
          </Action.ActionMenuItem>
        }
      >
        <For each={models()}>
          {(model) => (
            <Action.ActionMenuItem
              label={model.disabled ? `Model: ${model.name} (unavailable)` : `Model: ${model.name}`}
              onSelect={() => {
                if (model.disabled) return
                setModel.mutate(model.id)
              }}
            >
              <Show when={model.id === value()} fallback={<span class="size-4 block" aria-hidden="true" />}>
                <Check class="size-4 block" aria-hidden="true" />
              </Show>
            </Action.ActionMenuItem>
          )}
        </For>
      </Show>
    </Action.Action>
  )
}
