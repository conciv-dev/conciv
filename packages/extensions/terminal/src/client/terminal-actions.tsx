import {createMemo, createResource, createSignal, For, Match, Show, Switch, type JSX} from 'solid-js'
import {Crosshair, Plus, RotateCw, SquareArrowOutUpRight} from 'lucide-solid'
import {ModelSelector, TooltipIconButton, useModelSelectorContext} from '@conciv/ui-kit-chat'
import type {ModelOption} from '@conciv/ui-kit-chat'
import {Button} from '@conciv/ui-kit-system'
import type {HarnessModelInfo} from '@conciv/protocol/chat-types'
import {defineClient} from '@conciv/api-client'
import {useTerminalContext} from './terminal-context.js'

const MODEL_KEY = 'pw-conciv-model'

function readStoredModel(): string | null {
  try {
    return localStorage.getItem(MODEL_KEY)
  } catch {
    return null
  }
}

function writeStoredModel(id: string): void {
  try {
    localStorage.setItem(MODEL_KEY, id)
  } catch {}
}

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
  const ctx = useTerminalContext()
  const api = defineClient({apiBase: ctx.apiBase})
  const busy = () => ctx.store.busy()
  const [models, {refetch}] = createResource(async () => {
    const {models: list} = await api.models()
    const stored = ctx.store.spawnModel() ?? readStoredModel()
    ctx.store.setSpawnModel(stored && list.some((model) => model.id === stored) ? stored : null)
    return list
  })
  const options = createMemo(() => (models() ?? []).map(toOption))
  const [opening, setOpening] = createSignal(false)
  const pickModel = (id: string) => {
    if (busy() || id === ctx.store.spawnModel()) return
    ctx.store.setSpawnModel(id)
    writeStoredModel(id)
    ctx.store.bumpRespawn()
  }
  const openExternally = async () => {
    if (opening()) return
    setOpening(true)
    try {
      const res = await ctx.client.launch({model: ctx.store.spawnModel() ?? undefined})
      if (!res.supported || !res.command) {
        ctx.notify('This harness can’t be opened in a terminal.')
        return
      }
      if (res.opened) {
        ctx.view.leave()
        ctx.notify('Opened externally.')
        return
      }
      await navigator.clipboard.writeText(res.command).then(
        () => {
          ctx.view.leave()
          ctx.notify('Command copied — paste it in your terminal.')
        },
        () => ctx.notify(`Run in your terminal: ${res.command}`),
      )
    } catch {
      ctx.notify('Couldn’t open externally.')
    } finally {
      setOpening(false)
    }
  }
  const pickElement = async () => {
    try {
      const picked = await ctx.grab.pick()
      if (picked) ctx.grab.stage(picked)
    } catch {}
  }
  return (
    <>
      <TooltipIconButton
        tooltip="Select an element from the page"
        class="shrink-0 size-7"
        onClick={() => void pickElement()}
      >
        <Crosshair class="size-4 block" aria-hidden="true" />
      </TooltipIconButton>
      <span class="mx-0.5 bg-pw-line-2 shrink-0 h-4 w-px" aria-hidden="true" />
      <Switch>
        <Match when={models.loading}>
          <Button variant="outline" size="sm" class="shrink-0 h-7" disabled aria-label="Loading models">
            Models…
          </Button>
        </Match>
        <Match when={models.error}>
          <Button
            variant="outline"
            size="sm"
            class="text-pw-danger shrink-0 gap-1.5 h-7"
            onClick={() => void refetch()}
          >
            <RotateCw class="size-3.5 block" aria-hidden="true" />
            Retry
          </Button>
        </Match>
        <Match when={options().length === 0}>
          <Button variant="outline" size="sm" class="shrink-0 h-7" disabled>
            No models
          </Button>
        </Match>
        <Match when={options().length > 0}>
          <ModelSelector.Root models={options()} value={ctx.store.spawnModel() ?? undefined} onValueChange={pickModel}>
            <ModelSelector.Trigger disabled={busy()} classList={{'anim-switching': ctx.store.respawning()}} />
            <ModelSelector.Content>
              <ModelSelector.Search placeholder="Search models…" />
              <div class="flex-1 overflow-y-auto">
                <ModelList />
              </div>
            </ModelSelector.Content>
          </ModelSelector.Root>
        </Match>
      </Switch>
      <TooltipIconButton
        tooltip="Start a new session"
        class="shrink-0 size-7"
        disabled={busy()}
        onClick={() => ctx.newSession()}
      >
        <Plus class="size-4 block" aria-hidden="true" />
      </TooltipIconButton>
      <TooltipIconButton
        tooltip="Open externally"
        class="shrink-0 size-7"
        disabled={busy() || opening()}
        onClick={() => void openExternally()}
      >
        <SquareArrowOutUpRight class="size-4 block" aria-hidden="true" />
      </TooltipIconButton>
    </>
  )
}
