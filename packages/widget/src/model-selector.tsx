import {createSignal, For, onMount, Show, type JSX} from 'solid-js'
import {Combobox, useListCollection} from '@ark-ui/solid/combobox'
import {Check, ChevronsUpDown} from 'lucide-solid'
import type {HarnessModelInfo} from '@aidx/protocol/chat-types'
import {createChatApi} from './chat-api.js'
import type {ComposerControlDef} from './widget-shell.js'

// Bucket models by their `group` (provider/family), preserving first-seen order. Ungrouped
// models fall under a single 'Models' heading.
function groupsOf(models: ReadonlyArray<HarnessModelInfo>): {name: string; items: HarnessModelInfo[]}[] {
  const order: string[] = []
  const byGroup = new Map<string, HarnessModelInfo[]>()
  for (const m of models) {
    const g = m.group ?? 'Models'
    const bucket = byGroup.get(g)
    if (bucket) bucket.push(m)
    else {
      byGroup.set(g, [m])
      order.push(g)
    }
  }
  return order.map((name) => ({name, items: byGroup.get(name) ?? []}))
}

function matches(m: HarnessModelInfo, query: string): boolean {
  if (!query) return true
  return `${m.name} ${m.id} ${m.description ?? ''}`.toLowerCase().includes(query.toLowerCase())
}

// The composer's model picker: assistant-ui's Popover+Command pattern rebuilt on Ark UI's headless
// Combobox (the Solid-capable, unstyled equivalent). The trigger shows the current model; opening
// reveals a searchable, provider-grouped list. Disabled models render greyed and unselectable.
export function ModelSelector(props: {
  models: ReadonlyArray<HarnessModelInfo>
  value: string | null
  onChange: (id: string) => void
}): JSX.Element {
  // Ark's stable collection + built-in filter (per their Solid example). Rebuilding the collection
  // per keystroke resets the combobox machine mid-interaction, which breaks positioning + clicks.
  const {collection, filter} = useListCollection<HarnessModelInfo>({
    initialItems: props.models.slice(),
    filter: (_itemText, query, item) => matches(item, query),
    itemToValue: (m) => m.id,
    itemToString: (m) => m.name,
    isItemDisabled: (m) => Boolean(m.disabled),
  })
  const selectedName = () => props.models.find((m) => m.id === props.value)?.name ?? 'Model'
  // Drive the in-popover input as a PURE search box (controlled), so it never echoes the selected
  // model — Ark would otherwise bind it to the value. The current model shows only on the trigger.
  const [query, setQuery] = createSignal('')
  const resetSearch = () => {
    setQuery('')
    filter('')
  }
  return (
    <Combobox.Root
      class="pw-model"
      collection={collection()}
      value={props.value ? [props.value] : []}
      inputValue={query()}
      onValueChange={(d) => {
        const id = d.value[0]
        if (id) props.onChange(id)
        resetSearch()
      }}
      onInputValueChange={(d) => {
        setQuery(d.inputValue)
        filter(d.inputValue)
      }}
      onOpenChange={(d) => {
        if (d.open) resetSearch()
      }}
      openOnClick
      // 'clear' makes Ark blank the input after a pick (not echo the model name back into it), so
      // selecting never leaves the list filtered down to the chosen row.
      selectionBehavior="clear"
      positioning={{strategy: 'fixed', placement: 'top-start', gutter: 6}}
    >
      {/* assistant-ui's Popover+Command shape: the Trigger is a button pill showing the current
          model (not a text field); the search Input lives inside the popover Content. */}
      <Combobox.Control class="pw-model-control">
        <Combobox.Trigger class="pw-model-trigger" aria-label="Select model" title="Select model">
          <span class="pw-model-current">{selectedName()}</span>
          <ChevronsUpDown class="pw-model-caret" aria-hidden="true" />
        </Combobox.Trigger>
      </Combobox.Control>
      <Combobox.Positioner>
        <Combobox.Content class="pw-model-content pw-combo-content">
          <Combobox.Input class="pw-model-search" placeholder="Search models…" />
          <div class="pw-model-list">
            <Show when={collection().items.length === 0}>
              <div class="pw-model-empty">No models match</div>
            </Show>
            <For each={groupsOf(collection().items)}>
              {(group) => (
                <Combobox.ItemGroup class="pw-model-group">
                  <Combobox.ItemGroupLabel class="pw-model-group-label">{group.name}</Combobox.ItemGroupLabel>
                  <For each={group.items}>
                    {(m) => (
                      <Combobox.Item item={m} class="pw-model-item">
                        <div class="pw-model-item-text">
                          <Combobox.ItemText>{m.name}</Combobox.ItemText>
                          <Show when={m.description}>
                            <span class="pw-model-desc">{m.description}</span>
                          </Show>
                        </div>
                        <Combobox.ItemIndicator class="pw-model-check">
                          <Check class="pw-model-check-icon" aria-hidden="true" />
                        </Combobox.ItemIndicator>
                      </Combobox.Item>
                    )}
                  </For>
                </Combobox.ItemGroup>
              )}
            </For>
          </div>
        </Combobox.Content>
      </Combobox.Positioner>
    </Combobox.Root>
  )
}

// Persist the user's pick across sessions. Keyed globally (one composer model at a time); a future
// per-harness key can slot in here without touching the plugin contract.
const MODEL_KEY = 'pw-aidx-model'
function readStoredModel(): string | null {
  try {
    return localStorage.getItem(MODEL_KEY)
  } catch {
    return null
  }
}
function storeModel(id: string): void {
  try {
    localStorage.setItem(MODEL_KEY, id)
  } catch {
    // storage blocked — selection still lives in memory for this session
  }
}

// The composer-control plugin. Registered on the shell (mount.tsx), it fetches the active harness's
// models, owns the selection (persisted), and ships it on every turn via ctx.setRequestMeta({model}).
// Renders nothing until models load AND the harness advertises at least one.
export const modelSelectorControl: ComposerControlDef = {
  id: 'model-selector',
  create: (ctx) => {
    const api = createChatApi({apiBase: ctx.apiBase})
    const [models, setModels] = createSignal<HarnessModelInfo[]>([])
    const [model, setModel] = createSignal<string | null>(readStoredModel())
    const select = (id: string) => {
      setModel(id)
      storeModel(id)
      ctx.setRequestMeta({model: id})
    }
    onMount(() => {
      const stored = model()
      if (stored) ctx.setRequestMeta({model: stored})
      void api
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
        <ModelSelector models={models()} value={model()} onChange={select} />
      </Show>
    )
  },
}
