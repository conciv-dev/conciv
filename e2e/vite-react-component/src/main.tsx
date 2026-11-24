import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {ConcivWidget} from '@conciv/react'
import './index.css'
import App from './App.tsx'

const root = document.getElementById('root')
if (!root) throw new Error('the page has no #root element')

createRoot(root).render(
  <StrictMode>
    <App />
    <ConcivWidget />
  </StrictMode>,
)
