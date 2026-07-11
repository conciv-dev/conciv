import {createMemo, createResource, createSignal, For, Match, Show, Switch, type JSX} from 'solid-js'
import {Crosshair, Plus, RotateCw, SquareArrowOutUpRight} from 'lucide-solid'
import {ModelSelector, useModelSelectorContext} from '@conciv/ui-kit-chat'
import type {ModelOption} from '@conciv/ui-kit-chat'
import {Button, TooltipIconButton} from '@conciv/ui-kit-system'
import type {HarnessModelInfo} from '@conciv/protocol/chat-types'
import {getHostApi} from '@conciv/extension'
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
  const host = getHostApi()
  const store = useTerminalContext((context) => context.store)
  const rpc = host.useRpc()
  const sessionId = host.useSessionId()
  const toast = host.useToast()
  const leaveView = host.useLeaveView()
  const grab = host.useGrab()
  const newSession = host.useNewSession()
  const busy = () => store.busy()
  const [models, {refetch}] = createResource(async () => {
    const {models: list} = await rpc.meta.models(undefined)
    const stored = store.spawnModel() ?? readStoredModel()
    store.setSpawnModel(stored && list.some((model) => model.id === stored) ? stored : null)
    return list
  })
  const options = createMemo(() => (models() ?? []).map(toOption))
  const [opening, setOpening] = createSignal(false)
  const pickModel = (id: string) => {
    if (busy() || id === store.spawnModel()) return
    store.setSpawnModel(id)
    writeStoredModel(id)
    store.bumpRespawn()
  }
  const launch = async (): Promise<void> => {
    const id = sessionId()
    if (!id) return toast('No active session.')
    const res = await rpc.sessions.launch({sessionId: id, model: store.spawnModel() ?? undefined})
    if (!res.supported || !res.command) {
      toast('This harness can’t be opened in a terminal.')
      return
    }
    if (res.opened) {
      leaveView()
      toast('Opened externally.')
      return
    }
    await navigator.clipboard.writeText(res.command).then(
      () => {
        leaveView()
        toast('Command copied — paste it in your terminal.')
      },
      () => toast(`Run in your terminal: ${res.command}`),
    )
  }
  const openExternally = async () => {
    if (opening()) return
    setOpening(true)
    try {
      await launch()
    } catch {
      toast('Couldn’t open externally.')
    } finally {
      setOpening(false)
    }
  }
  const pickElement = async () => {
    try {
      const picked = await grab.pick()
      if (picked) grab.stage(picked)
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
          <ModelSelector.Root models={options()} value={store.spawnModel() ?? undefined} onValueChange={pickModel}>
            <ModelSelector.Trigger disabled={busy()} classList={{'anim-switching': store.respawning()}} />
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
        onClick={() => newSession()}
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
