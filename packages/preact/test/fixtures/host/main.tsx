import {render} from 'preact'
import {useState} from 'preact/hooks'
import terminal from '@conciv/extension-terminal/client'
import {ConcivWidget} from '@conciv/preact'

const apiBase = new URLSearchParams(window.location.search).get('core') ?? ''
const extensions = [terminal]

function App() {
  const [enabled, setEnabled] = useState(true)
  const [defaultOpen, setDefaultOpen] = useState(false)
  return (
    <>
      <button onClick={() => setEnabled((value) => !value)}>toggle widget</button>
      <button onClick={() => setDefaultOpen(true)}>open by default</button>
      {enabled ? <ConcivWidget extensions={extensions} apiBase={apiBase} settings={{defaultOpen}} /> : null}
    </>
  )
}

const container = document.getElementById('app')
if (container) render(<App />, container)
