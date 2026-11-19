import {Show} from 'solid-js'
import TerminalIcon from 'lucide-solid/icons/terminal'
import {Panel, Plugin, Slot, type PanelTab} from '@conciv/plugin/experimental'
import {terminalDeclarations} from './stores.js'
import {TerminalPanel} from './terminal-panel.js'
import {createTerminalState, PANEL_KEY} from './terminal-state.js'
import {TerminalToolbar} from './terminal-toolbar.js'

const TAB_ID = 'terminal'

const tab: PanelTab = {
  id: TAB_ID,
  title: 'Terminal',
  pinned: true,
  label: () => (
    <span class="flex gap-1 items-center">
      <TerminalIcon class="shrink-0 size-3" aria-hidden="true" />
      <span class="self-baseline">Terminal</span>
    </span>
  ),
}

export default Plugin.define({
  ...terminalDeclarations,
  setup(ctx) {
    const terminal = createTerminalState(ctx)

    ctx.add(Panel, {
      id: TAB_ID,
      region: 'pane',
      list: (input) => {
        const known = terminal.supported(input.session.id)
        if (known === true) return [tab]
        if (known === undefined && input.open.includes(TAB_ID)) return [tab]
        return []
      },
      render: (props) => <TerminalPanel session={props.session} terminal={terminal} />,
    })

    ctx.add(Slot, {
      at: 'session.panel.end',
      render: (input) => (
        <Show when={ctx.layout.state(PANEL_KEY, input.session) === 'visible'}>
          <TerminalToolbar session={input.session} terminal={terminal} />
        </Show>
      ),
    })
  },
})
