import {Exit, Layer, ManagedRuntime, Scope} from 'effect'
import {onCleanup} from 'solid-js'
import TerminalIcon from 'lucide-solid/icons/terminal'
import {Panel, Plugin, type PanelTab} from '@conciv/plugin/experimental'
import {terminalDeclarations} from './stores.js'
import {TerminalPanel} from './terminal-panel.js'
import {createTerminalState} from './terminal-state.js'

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
    const runtime = ManagedRuntime.make(Layer.empty)
    const scope = runtime.runSync(Scope.make())
    onCleanup(() => void runtime.runPromise(Scope.close(scope, Exit.void)).finally(() => runtime.dispose()))
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
