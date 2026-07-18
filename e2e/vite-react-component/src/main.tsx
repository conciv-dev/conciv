import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import terminal from '@conciv/extension-terminal/client'
import {ConcivWidget} from '@conciv/react'
import './index.css'
import App from './App.tsx'

const extensions = [terminal]

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <ConcivWidget extensions={extensions} />
  </StrictMode>,
)
