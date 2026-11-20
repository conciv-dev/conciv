import {describe, expect, test} from 'vitest'
import {render, screen, waitFor} from '@solidjs/testing-library'
import {createSignal, For} from 'solid-js'
import {compose} from '@conciv/plugin/experimental/host'
import {Panel, type Plugin} from '@conciv/plugin/experimental'
import {QueryClient} from '@conciv/client'
import {DialogProvider} from './dialog-stack'
import {PluginHostProvider, usePluginHost, type HostApiFactories} from './host'

const unreached = (): never => {
  throw new Error('This host reaches no host api')
}

const apis: HostApiFactories = {
  app: unreached,
  appearance: unreached,
  attention: unreached,
  commands: unreached,
  desktop: unreached,
  keybinds: unreached,
  layout: unreached,
  overlay: unreached,
  router: unreached,
  screen: unreached,
  servers: unreached,
  sessions: unreached,
  storage: unreached,
  system: unreached,
  tabs: unreached,
  toast: unreached,
  ui: unreached,
}

const addsPanel: Plugin.Setup = (ctx) => {
  ctx.add(Panel, {id: ctx.id, region: 'pane', list: () => [], render: () => null})
}

const definitions = compose({
  first: {windowEntry: () => Promise.resolve({default: addsPanel})},
  second: {windowEntry: () => Promise.resolve({default: addsPanel})},
  third: {windowEntry: () => Promise.resolve({default: addsPanel})},
})

function PanelList() {
  const host = usePluginHost()

  return (
    <ul>
      <For each={host.items(Panel)}>{(item) => <li>{item.value.id}</li>}</For>
    </ul>
  )
}

const shown = () => screen.getAllByRole('listitem').map((item) => item.textContent)

describe('plugin host items', () => {
  test('a plugin turned off and on again keeps its place in the plugin list order', async () => {
    const [disabled, setDisabled] = createSignal<ReadonlySet<string>>(new Set())

    render(() => (
      <DialogProvider>
        <PluginHostProvider
          definitions={() => definitions}
          disabled={disabled}
          apis={apis}
          whenMounted={unreached}
          unavailableClient={unreached}
          queryClient={new QueryClient()}
        >
          <PanelList />
        </PluginHostProvider>
      </DialogProvider>
    ))

    await screen.findByText('third')
    expect(shown()).toEqual(['first', 'second', 'third'])

    setDisabled(new Set(['second']))
    await waitFor(() => expect(screen.queryByText('second')).toBeNull())
    expect(shown()).toEqual(['first', 'third'])

    setDisabled(new Set<string>())
    await screen.findByText('second')
    expect(shown()).toEqual(['first', 'second', 'third'])
  })
})
