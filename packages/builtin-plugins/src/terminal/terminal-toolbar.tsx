import {createMemo, Show, type JSX} from 'solid-js'
import {pick} from 'es-toolkit'
import {ModelSelector, type ModelOption} from '@conciv/ui-kit-chat'
import {usePlugin, type MountedSession} from '@conciv/plugin/experimental'
import type {TerminalState} from './terminal-state.js'

export function TerminalToolbar(props: {session: MountedSession; terminal: TerminalState}): JSX.Element {
  const ctx = usePlugin()
  const options = createMemo(() =>
    props.terminal
      .models(props.session.id)
      .map((model): ModelOption => pick(model, ['id', 'name', 'description', 'disabled'])),
  )
  const locked = () => props.terminal.locked(props.session.id)
  return (
    <div class="flex gap-1 items-center">
      <Show when={options().length > 0}>
        <ModelSelector.Root
          models={options()}
          value={props.terminal.shownModel(props.session.id)}
          onValueChange={(model) => props.terminal.pick(props.session, model)}
        >
          <ModelSelector.Trigger disabled={locked()} />
          <ModelSelector.Content>
            <ModelSelector.Search placeholder="Search models…" />
            <ModelSelector.List />
          </ModelSelector.Content>
        </ModelSelector.Root>
      </Show>
      <ctx.ui.Tooltip value="New terminal">
        <ctx.ui.IconButton
          icon="plus"
          label="New terminal"
          variant="ghost"
          size="small"
          disabled={locked()}
          onClick={() => void props.terminal.restart(props.session)}
        />
      </ctx.ui.Tooltip>
    </div>
  )
}
