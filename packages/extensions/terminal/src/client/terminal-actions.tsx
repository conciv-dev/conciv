import {createMemo, createSignal, onMount, Show, For, type JSX} from 'solid-js'
import {Crosshair, SquarePen, SquareTerminal} from 'lucide-solid'
import {ModelSelector, TooltipIconButton, useModelSelectorContext} from '@conciv/ui-kit-chat'
import type {ModelOption} from '@conciv/ui-kit-chat'
import type {HarnessModelInfo} from '@conciv/protocol/chat-types'
import {defineClient} from '@conciv/api-client'
import {terminal} from '../client.js'

const MODEL_KEY = 'pw-conciv-model'

function toOption(model: HarnessModelInfo): ModelOption {
  return {id: model.id, name: model.name, description: model.description, disabled: model.disabled}
}

function ModelList(): JSX.Element {
  const context = useModelSelectorContext()
  return (
    <Show
      when={context.filteredModels().length > 0}
      fallback={<div class="text-xs text-pw-text-3 px-2 py-2.5">No models match</div>}
    >
      <For each={context.filteredModels()}>{(model) => <ModelSelector.Item model={model} />}</For>
    </Show>
  )
}

export function TerminalActions(): JSX.Element {
  const ctx = terminal.useContext()
  const api = defineClient({apiBase: ctx.apiBase})
  const [models, setModels] = createSignal<HarnessModelInfo[]>([])
  const busy = () => ctx.store.busy()
  onMount(() => {
    if (!ctx.store.spawnModel()) {
      const stored = localStorage.getItem(MODEL_KEY)
      if (stored) ctx.store.setSpawnModel(stored)
    }
    void api
      .models()
      .then(({models: list}) => setModels(list))
      .catch(() => {})
  })
  const options = createMemo(() => models().map(toOption))
  const pickModel = (id: string) => {
    if (id === ctx.store.spawnModel()) return
    ctx.store.setSpawnModel(id)
    ctx.store.bumpRespawn()
  }
  const openExternally = async () => {
    try {
      const res = await ctx.client.launch({model: ctx.store.spawnModel() ?? undefined})
      if (!res.supported || !res.command) {
        ctx.notify('This harness can’t be opened in a terminal.')
        return
      }
      ctx.view.leave()
      if (res.opened) {
        ctx.notify('Opened externally.')
        return
      }
      await navigator.clipboard.writeText(res.command).then(
        () => ctx.notify('Command copied — paste it in your terminal.'),
        () => ctx.notify(`Run in your terminal: ${res.command}`),
      )
    } catch {
      ctx.notify('Couldn’t open externally.')
    }
  }
  const pickElement = async () => {
    const picked = await ctx.grab.pick()
    if (picked) ctx.grab.stage(picked)
  }
  return (
    <>
      <TooltipIconButton
        tooltip="Select an element from the page"
        class="shrink-0 size-7"
        onClick={() => void pickElement()}
      >
        <Crosshair class="size-5 block" aria-hidden="true" />
      </TooltipIconButton>
      <Show when={options().length > 0}>
        <ModelSelector.Root models={options()} value={ctx.store.spawnModel() ?? undefined} onValueChange={pickModel}>
          <ModelSelector.Trigger />
          <ModelSelector.Content>
            <ModelSelector.Search placeholder="Search models…" />
            <div class="flex-1 overflow-y-auto">
              <ModelList />
            </div>
          </ModelSelector.Content>
        </ModelSelector.Root>
      </Show>
      <TooltipIconButton
        tooltip="Start a new session"
        class="shrink-0 size-7"
        disabled={busy()}
        onClick={() => ctx.newSession()}
      >
        <SquarePen class="size-5 block" aria-hidden="true" />
      </TooltipIconButton>
      <TooltipIconButton
        tooltip="Open externally"
        class="shrink-0 size-7"
        disabled={busy()}
        onClick={() => void openExternally()}
      >
        <SquareTerminal class="size-5 block" aria-hidden="true" />
      </TooltipIconButton>
    </>
  )
}
