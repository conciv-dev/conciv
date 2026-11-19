import {StrictMode, useState} from 'react'
import {createRoot} from 'react-dom/client'
import {ConcivWidget, type ConcivWidgetProps} from '@conciv/react'

const apiBase = new URLSearchParams(window.location.search).get('core') ?? ''

const grabProvider: ConcivWidgetProps['grabProvider'] = () => ({
  pick: async () => ({
    text: '<h1>Fixture heading</h1> at src/fixture.tsx:3:1',
    snippet: '<h1>Fixture heading</h1>',
    preview: {kind: 'dom', html: '<p>Fixture heading</p>', width: 200, height: 40},
    source: {componentName: 'FixtureHeading', filePath: 'src/fixture.tsx', lineNumber: 3},
    rect: {x: 0, y: 0, width: 200, height: 40},
  }),
  comment: async () => null,
  cancel: () => {},
  isActive: () => false,
})

function App() {
  const [enabled, setEnabled] = useState(true)
  const [defaultOpen, setDefaultOpen] = useState(false)
  return (
    <>
      <button onClick={() => setEnabled((value) => !value)}>toggle widget</button>
      <button onClick={() => setDefaultOpen(true)}>open by default</button>
      {enabled ? <ConcivWidget apiBase={apiBase} grabProvider={grabProvider} settings={{defaultOpen}} /> : null}
    </>
  )
}

const container = document.getElementById('app')
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
