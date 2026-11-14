import {createMemo, For, Match, Show, Switch, type JSX} from 'solid-js'
import Crosshair from 'lucide-solid/icons/crosshair'
import Plus from 'lucide-solid/icons/plus'
import RotateCw from 'lucide-solid/icons/rotate-cw'
import {ModelSelector, useModelSelectorContext} from '@conciv/ui-kit-chat'
import type {ModelOption} from '@conciv/ui-kit-chat'
import {Button, Tooltip, TooltipIconButton} from '@conciv/ui-kit-system'
import type {HarnessModelInfo} from '@conciv/protocol/chat-types'
import {getExtensionApi} from '@conciv/extension'
import {TERMINAL_NAME} from '../shared/protocol.js'
import {useTerminalContext} from './terminal-context.js'
import {useTerminalModels} from './terminal-models.js'

function toOption(model: HarnessModelInfo): ModelOption {
  return {id: model.id, name: model.name, description: model.description, disabled: model.disabled}
}

function ModelList(): JSX.Element {
  const context = useModelSelectorContext()
  return (
    <Show
      when={context.filteredModels().length > 0}
      fallback={<div class="text-xs text-chat-text-3 px-2 py-2.5">No models match</div>}
    >
      <For each={context.filteredModels()}>{(model) => <ModelSelector.Item model={model} />}</For>
    </Show>
  )
}

export function TerminalActions(): JSX.Element {
  const host = getExtensionApi(TERMINAL_NAME)
  const store = useTerminalContext((context) => context.store)
  const grab = host.useGrab()
  const newSession = host.useNewSession()
  const busy = () => store.busy()
  const terminalModels = useTerminalModels()
  const models = terminalModels.models
  const options = createMemo(() => terminalModels.list().map(toOption))
  const pickModel = (id: string) => {
    if (busy() || id === terminalModels.spawnModel()) return
    terminalModels.choose(id)
    store.bumpRespawn()
  }
  const pickElement = async () => {
    try {
      const picked = await grab.pick()
      if (picked) grab.stage(picked)
    } catch {}
  }
  const grabDisabled = () => (grab.grabbable ? !grab.grabbable() : false)
  return (
    <Tooltip.Group>
      <TooltipIconButton
        tooltip={grabDisabled() ? 'Nothing on this screen to select' : 'Select an element from the page'}
        class="shrink-0 size-7"
        disabled={grabDisabled()}
        onClick={() => void pickElement()}
      >
        <Crosshair class="size-4 block" aria-hidden="true" />
      </TooltipIconButton>
      <span class="mx-0.5 bg-chat-line-2 shrink-0 h-4 w-px" aria-hidden="true" />
      <Switch>
        <Match when={models.isLoading}>
          <Button variant="outline" size="sm" class="shrink-0" disabled aria-label="Loading models">
            Models…
          </Button>
        </Match>
        <Match when={models.isError}>
          <Button
            variant="outline"
            size="sm"
            class="text-chat-danger shrink-0 gap-1.5"
            onClick={() => void models.refetch()}
          >
            <RotateCw class="size-3.5 block" aria-hidden="true" />
            Retry
          </Button>
        </Match>
        <Match when={options().length === 0}>
          <Button variant="outline" size="sm" class="shrink-0" disabled>
            No models
          </Button>
        </Match>
        <Match when={options().length > 0}>
          <ModelSelector.Root
            models={options()}
            value={terminalModels.spawnModel() ?? undefined}
            onValueChange={pickModel}
          >
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
    </Tooltip.Group>
  )
}
