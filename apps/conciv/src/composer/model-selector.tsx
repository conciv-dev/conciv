import {createMemo, For, Show, type JSX} from 'solid-js'
import {useQuery, useMutation} from '@tanstack/solid-query'
import {ModelSelector, useModelSelectorContext, type ModelOption} from '@conciv/ui-kit-chat'
import type {HarnessModelInfo} from '@conciv/protocol/chat-types'
import {useApp} from '../app/context.js'

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

export function SessionModelSelector(props: {sessionId: string}): JSX.Element {
  const app = useApp()
  const meta = useQuery(() => app.data.utils.meta.models.queryOptions())
  const sessions = useQuery(() => app.data.utils.sessions.list.queryOptions())
  const setModel = useMutation(() => ({
    mutationFn: (model: string) => app.rpc.sessions.setModel({sessionId: props.sessionId, model}),
    onError: () => app.announce('Could not switch model', true),
    onSettled: () => app.data.invalidateSessions(),
  }))

  const models = () => meta.data?.models ?? []
  const value = () => {
    const row = (sessions.data ?? []).find((session) => session.id === props.sessionId)
    return row?.model ?? meta.data?.defaultModel ?? null
  }
  const options = createMemo(() => models().map(toOption))

  return (
    <Show when={models().length > 0}>
      <ModelSelector.Root models={options()} value={value() ?? undefined} onValueChange={(id) => setModel.mutate(id)}>
        <ModelSelector.Trigger />
        <ModelSelector.Content>
          <ModelSelector.Search placeholder="Search models…" />
          <div class="flex-1 overflow-y-auto">
            <GroupedModelList models={models()} />
          </div>
          <ModelSelector.Effort />
        </ModelSelector.Content>
      </ModelSelector.Root>
    </Show>
  )
}
