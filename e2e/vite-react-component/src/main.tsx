import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {ConcivWidget} from '@conciv/react'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <ConcivWidget />
  </StrictMode>,
)
