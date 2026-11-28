import {Layer} from 'effect'
import TerminalIcon from 'lucide-solid/icons/terminal'
import {createScopedRuntime, Panel, Plugin, Style, type PanelTab} from '@conciv/frontend-plugin-api'
import {terminalDeclarations} from './stores.js'
import {TerminalPanel} from './terminal-panel.js'
import {createTerminalState} from './terminal-state.js'
import pluginCss from './.generated/css.js'

const TAB_ID = 'terminal'

const tab: PanelTab = {
  id: TAB_ID,
  title: 'Terminal',
  pinned: true,
  label: () => (
    <>
      <TerminalIcon aria-hidden="true" />
      Terminal
    </>
  ),
}

export default Plugin.define({
  ...terminalDeclarations,
  setup(ctx) {
    ctx.add(Style, pluginCss)
    const {runtime, scope} = createScopedRuntime(Layer.empty)
    const terminal = createTerminalState(ctx, runtime, scope)

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
  },
})
