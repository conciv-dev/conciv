import {render} from 'preact'
import terminal from '@conciv/extension-terminal/client'
import {ConcivWidget} from '@conciv/preact'
import './index.css'
import App from './App.tsx'

const extensions = [terminal]
const container = document.getElementById('root')

if (container) {
  render(
    <>
      <App />
      <ConcivWidget extensions={extensions} />
    </>,
    container,
  )
}
