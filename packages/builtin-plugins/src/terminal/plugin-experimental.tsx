import {untrack} from 'solid-js'
import TerminalIcon from 'lucide-solid/icons/terminal'
import {createLatest, Panel, Plugin, type PanelTab, type Context} from '@conciv/plugin/experimental'
import {TerminalPanel} from './terminal-panel.js'

const TAB_ID = 'terminal'

const tab: PanelTab = {
  id: TAB_ID,
  title: 'Terminal',
  pinned: true,
  label: () => (
    <span class="flex gap-1 items-center">
      <TerminalIcon class="shrink-0 size-3" aria-hidden="true" />
      Terminal
    </span>
  ),
}

async function readSupport(ctx: Context, sessionId: string, signal: AbortSignal) {
  const session = untrack(() => ctx.sessions.current())
  if (session?.id !== sessionId) throw new Error(`the terminal read support for ${sessionId} after it was left`)
  const models = await session.server.client.meta.models({sessionId}, {signal})
  return {sessionId, persistentPty: models.harness.persistentPty}
}

export default Plugin.define({
  setup(ctx) {
    const support = createLatest(
      () => ctx.sessions.current()?.id,
      (sessionId, signal) => readSupport(ctx, sessionId, signal),
    )
    const supported = (sessionId: string) =>
      support.latest?.sessionId === sessionId ? support.latest.persistentPty : undefined

    ctx.add(Panel, {
      id: TAB_ID,
      region: 'pane',
      list: (input) => {
        const known = supported(input.session.id)
        if (known === true) return [tab]
        if (known === undefined && input.open.includes(TAB_ID)) return [tab]
        return []
      },
      render: (props) => <TerminalPanel session={props.session} />,
    })
  },
})
