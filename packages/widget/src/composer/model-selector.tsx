import {createMemo, createSignal, For, onMount, Show, type JSX} from 'solid-js'
import {ModelSelector, useModelSelectorContext, type ModelOption} from '@conciv/ui-kit-chat'
import type {HarnessModelInfo} from '@conciv/protocol/chat-types'
import {defineClient} from '@conciv/api-client'
import {createPersistedSignal} from '../lib/persisted-signal.js'
import type {ComposerControlDef} from '../shell/widget-shell.js'

// The composer's model picker IS @conciv/ui-kit-chat's ModelSelector (the assistant-ui port). The
// widget only maps its harness models onto ModelOption and owns the provider grouping — ModelOption is
// provider-agnostic by design, so the bucketing is consumer-composed over the selector's filtered set.
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

// Reads the selector's already-search-filtered models from context and renders them provider-grouped,
// reusing ui-kit-chat's Group + Item (no Ark, no bespoke list here).
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

function ModelPicker(props: {
  models: ReadonlyArray<HarnessModelInfo>
  value: string | null
  onChange: (id: string) => void
}): JSX.Element {
  const options = createMemo(() => props.models.map(toOption))
  return (
    <ModelSelector.Root models={options()} value={props.value ?? undefined} onValueChange={props.onChange}>
      <ModelSelector.Trigger />
      <ModelSelector.Content>
        <ModelSelector.Search placeholder="Search models…" />
        <div class="flex-1 overflow-y-auto">
          <GroupedModelList models={props.models} />
        </div>
        <ModelSelector.Effort />
      </ModelSelector.Content>
    </ModelSelector.Root>
  )
}

// Persist the user's pick across sessions. Keyed globally (one composer model at a time); a future
// per-harness key can slot in here without touching the plugin contract.
const MODEL_KEY = 'pw-conciv-model'

// The composer-control plugin. Registered on the shell (mount.tsx), it fetches the active harness's
// models, owns the selection (persisted), and ships it on every turn via ctx.setRequestMeta({model}).
// Renders nothing until models load AND the harness advertises at least one.
export const modelSelectorControl: ComposerControlDef = {
  id: 'model-selector',
  create: (ctx) => {
    // Models aren't session-scoped → a header-less client (never setSessionId).
    const client = defineClient({apiBase: ctx.apiBase})
    const [models, setModels] = createSignal<HarnessModelInfo[]>([])
    const [model, setModel] = createPersistedSignal<string | null>({
      key: MODEL_KEY,
      initial: null,
      parse: (raw) => raw || null,
    })
    const select = (id: string) => {
      setModel(id)
      ctx.setRequestMeta({model: id})
    }
    onMount(() => {
      const stored = model()
      if (stored) ctx.setRequestMeta({model: stored})
      void client
        .models()
        .then(({models: list, defaultModel}) => {
          setModels(list)
          const cur = model()
          const valid = cur ? list.some((m) => m.id === cur && !m.disabled) : false
          if (valid) return
          const next = defaultModel ?? list.find((m) => !m.disabled)?.id ?? null
          if (next) select(next)
        })
        .catch(() => {
          // No /models route (older core / non-chat server) → selector stays hidden.
        })
    })
    return (
      <Show when={models().length > 0}>
        <ModelPicker models={models()} value={model()} onChange={select} />
      </Show>
    )
  },
}
