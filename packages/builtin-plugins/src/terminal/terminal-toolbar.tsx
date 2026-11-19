import {type JSX} from 'solid-js'
import {HarnessModelSelector, useModelMenu} from '@conciv/ui-kit-chat'
import {usePlugin, type MountedSession} from '@conciv/plugin/experimental'
import type {TerminalState} from './terminal-state.js'

export function TerminalToolbar(props: {session: MountedSession; terminal: TerminalState}): JSX.Element {
  const ctx = usePlugin()
  const menu = useModelMenu()
  const locked = () => props.terminal.locked(props.session.id)
  const status = () => {
    if (props.terminal.modelsFailed(props.session.id)) return 'failed'
    return props.terminal.modelsLoading(props.session.id) ? 'loading' : 'ready'
  }
  return (
    <div class="flex gap-1 items-center">
      <HarnessModelSelector
        menu={menu}
        status={status()}
        models={props.terminal.meta(props.session.id)}
        value={props.terminal.shownModel(props.session) ?? null}
        disabled={locked()}
        onRetry={() => props.terminal.reloadModels()}
        onModelChange={(model) => props.terminal.pick(props.session, model)}
      />
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
