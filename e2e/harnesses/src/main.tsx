import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import './style.css'

function App() {
  return (
    <main>
      <h1>Conciv harness E2E fixture</h1>
      <p>This consumer app verifies the complete widget against each configured harness adapter.</p>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
