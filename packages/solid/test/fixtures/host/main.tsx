import {createSignal, Show} from 'solid-js'
import {render} from 'solid-js/web'
import terminal from '@conciv/extension-terminal/client'
import {ConcivWidget} from '@conciv/solid'

const apiBase = new URLSearchParams(window.location.search).get('core') ?? ''
const extensions = [terminal]

function App() {
  const [enabled, setEnabled] = createSignal(true)
  const [defaultOpen, setDefaultOpen] = createSignal(false)
  return (
    <>
      <button onClick={() => setEnabled((value) => !value)}>toggle widget</button>
      <button onClick={() => setDefaultOpen(true)}>open by default</button>
      <Show when={enabled()}>
        <ConcivWidget extensions={extensions} apiBase={apiBase} settings={{defaultOpen: defaultOpen()}} />
      </Show>
    </>
  )
}

const container = document.getElementById('app')
if (container) render(() => <App />, container)
