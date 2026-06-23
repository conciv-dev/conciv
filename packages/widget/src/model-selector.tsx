import {createSignal, For, onMount, Show, type JSX} from 'solid-js'
import {Combobox} from '@mandarax/ui-kit-system'
import {useListCollection} from '@ark-ui/solid/combobox'
import {Check, ChevronsUpDown} from 'lucide-solid'
import type {HarnessModelInfo} from '@mandarax/protocol/chat-types'
import {defineClient} from '@mandarax/session-client'
import {createPersistedSignal} from './persisted-signal.js'
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
      <Combobox.Control class="inline-flex">
        <Combobox.Trigger
          class="text-xs text-pw-text-2 pl-2.5 pr-[0.4375rem] border border-pw-line rounded-pw-pill bg-pw-fill-soft inline-flex gap-1 h-7 max-w-42 cursor-pointer transition-[color,border-color,background-color] duration-[120ms] ease-pw items-center hover:text-pw-text-hi hover:border-pw-line-2 hover:bg-pw-fill-strong"
          aria-label="Select model"
          title="Select model"
        >
          <span class="truncate">{selectedName()}</span>
          <ChevronsUpDown class="opacity-70 shrink-0 size-3.25" aria-hidden="true" />
        </Combobox.Trigger>
      </Combobox.Control>
      <Combobox.Positioner>
        <Combobox.Content class="p-1 border border-pw-line-2 rounded-pw-md bg-pw-panel flex-col max-h-80 w-64 hidden shadow-pw-lg z-10 focus-visible:outline-none data-[state=open]:flex data-[state=open]:anim-combo">
          <Combobox.Input
            class="text-[0.8125rem] text-pw-text mb-1 px-2 border-0 border-b border-b-pw-line-soft rounded-none bg-transparent h-8 w-full placeholder:text-pw-text-3 focus:outline-none"
            placeholder="Search models…"
          />
          <div class="flex-1 overflow-y-auto">
            <Show when={collection().items.length === 0}>
              <div class="text-xs text-pw-text-3 px-2 py-2.5">No models match</div>
            </Show>
            <For each={groupsOf(collection().items)}>
              {(group) => (
                <Combobox.ItemGroup>
                  <Combobox.ItemGroupLabel class="text-[0.6875rem] text-pw-text-3 tracking-[0.02em] font-semibold px-2 pb-0.5 pt-1.5 uppercase">
                    {group.name}
                  </Combobox.ItemGroupLabel>
                  <For each={group.items}>
                    {(m) => (
                      <Combobox.Item
                        item={m}
                        class="text-pw-text px-2 py-[0.4375rem] rounded-pw-sm flex gap-2 cursor-pointer items-center data-[disabled]:text-pw-text-3 data-[highlighted]:text-pw-text-hi data-[highlighted]:bg-pw-fill-strong data-[disabled]:cursor-not-allowed"
                      >
                        <div class="flex flex-1 flex-col gap-px min-w-0">
                          <Combobox.ItemText>{m.name}</Combobox.ItemText>
                          <Show when={m.description}>
                            <span class="text-[0.6875rem] text-pw-text-3">{m.description}</span>
                          </Show>
                        </div>
                        <Combobox.ItemIndicator class="text-pw-accent ml-auto hidden data-[state=checked]:inline-flex">
                          <Check class="size-3.75" aria-hidden="true" />
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
const MODEL_KEY = 'pw-mandarax-model'

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
        <ModelSelector models={models()} value={model()} onChange={select} />
      </Show>
    )
  },
}
