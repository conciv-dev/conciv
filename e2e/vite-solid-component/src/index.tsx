import {render} from 'solid-js/web'
import terminal from '@conciv/extension-terminal/client'
import {ConcivWidget} from '@conciv/solid'
import './index.css'
import App from './App.tsx'

const root = document.getElementById('root')
const extensions = [terminal]

render(
  () => (
    <>
      <App />
      <ConcivWidget extensions={extensions} />
    </>
  ),
  root!,
)
