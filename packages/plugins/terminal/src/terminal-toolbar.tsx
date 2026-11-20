import {createMemo, onCleanup, Show, type JSX} from 'solid-js'
import {HarnessModelSelector, useModelMenu} from '@conciv/ui-kit-chat'
import {usePlugin, type MountedSession} from '@conciv/plugin/experimental'
import {GrabApi} from '@conciv/plugin/experimental/grab'
import type {TerminalState} from './terminal-state.js'

export function TerminalToolbar(props: {session: MountedSession; terminal: TerminalState}): JSX.Element {
  const ctx = usePlugin()
  const menu = useModelMenu()
  const locked = () => props.terminal.locked(props.session.id)
  const live = ctx.use(GrabApi)
  const grab = createMemo(() => {
    const current = live()
    return current.status === 'active' ? current.value : undefined
  })
  const status = () => {
    if (props.terminal.modelsFailed(props.session.id)) return 'failed'
    return props.terminal.modelsLoading(props.session.id) ? 'loading' : 'ready'
  }
  return (
    <div
      class="px-1.5 py-1.5 border-b border-b-chat-line-soft border-b-solid flex shrink-0 gap-1 items-center"
      role="toolbar"
      aria-label="Terminal"
    >
      <Show when={props.session.id} keyed>
        <Show when={grab()}>{(contract) => <PickElementButton grab={contract()} />}</Show>
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
      <HarnessModelSelector
        menu={menu}
        status={status()}
        models={props.terminal.meta(props.session.id)}
        value={props.terminal.shownModel(props.session.id) ?? null}
        disabled={locked()}
        onRetry={() => props.terminal.reloadModels()}
        onModelChange={(model) => props.terminal.pick(props.session, model)}
      />
    </div>
  )
}

function PickElementButton(props: {grab: GrabApi}): JSX.Element {
  const ctx = usePlugin()
  const shown = {current: true}
  onCleanup(() => {
    shown.current = false
  })
  const pickElement = async () => {
    try {
      const picked = await props.grab.pick()
      if (picked && shown.current) props.grab.stage(picked)
    } catch (cause) {
      console.error('[terminal] picking an element failed', cause)
      void ctx.toast.show({title: 'Could not select that element', variant: 'error'})
    }
  }
  const label = () => (props.grab.grabbable() ? 'Select an element from the page' : 'Nothing on this screen to select')
  return (
    <>
      <ctx.ui.Tooltip value={label()}>
        <ctx.ui.IconButton
          icon="crosshair"
          label={label()}
          variant="ghost"
          size="small"
          disabled={!props.grab.grabbable()}
          onClick={() => void pickElement()}
        />
      </ctx.ui.Tooltip>
      <span class="bg-chat-line-2 shrink-0 h-4 w-px" aria-hidden="true" />
    </>
  )
}
