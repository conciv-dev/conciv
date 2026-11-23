import {createMemo, For, onCleanup, Show, type JSX} from 'solid-js'
import {HarnessModelSelector, useModelMenu} from '@conciv/ui-kit-chat'
import {usePlugin, type MountedSession} from '@conciv/plugin/experimental'
import type {Grab} from '@conciv/plugin/experimental/grab'
import {Page} from '@conciv/plugin/experimental/page'
import type {TerminalState} from './terminal-state.js'

export function TerminalToolbar(props: {session: MountedSession; terminal: TerminalState}): JSX.Element {
  const ctx = usePlugin()
  const menu = useModelMenu()
  const locked = () => props.terminal.locked(props.session.id)
  const live = ctx.use(Page)
  const page = createMemo(() => {
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
        <Show when={page()}>{(contract) => <PickElementButton page={contract()} terminal={props.terminal} />}</Show>
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

function PickElementButton(props: {page: Page; terminal: TerminalState}): JSX.Element {
  const ctx = usePlugin()
  const shown = {current: true}
  onCleanup(() => {
    shown.current = false
  })
  const pickElement = async () => {
    try {
      const picked = await props.page.pick()
      if (picked && shown.current) props.terminal.hold(picked)
    } catch (cause) {
      console.error('[terminal] picking an element failed', cause)
      void ctx.toast.show({title: 'Could not select that element', variant: 'error'})
    }
  }
  return (
    <>
      <ctx.ui.Tooltip value="Select an element from the page">
        <ctx.ui.IconButton
          icon="crosshair"
          label="Select an element from the page"
          variant="ghost"
          size="small"
          onClick={() => void pickElement()}
        />
      </ctx.ui.Tooltip>
      <For each={props.terminal.held()}>
        {(held, index) => (
          <span class="flex shrink-0 items-center">
            <ctx.ui.Chip value={grabName(held)} tooltip={held.text} compact />
            <ctx.ui.IconButton
              icon="x"
              label={`Remove ${grabName(held)}`}
              variant="ghost"
              size="small"
              onClick={() => props.terminal.release(index())}
            />
          </span>
        )}
      </For>
      <span class="bg-chat-line-2 shrink-0 h-4 w-px" aria-hidden="true" />
    </>
  )
}

function grabName(grab: Grab): string {
  return grab.source?.componentName ?? /^<([\w-]+)/u.exec(grab.snippet ?? grab.text)?.[1] ?? 'element'
}
