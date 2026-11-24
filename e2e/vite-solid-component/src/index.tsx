import {render} from 'solid-js/web'
import {ConcivWidget} from '@conciv/solid'
import './index.css'
import App from './App.tsx'

const root = document.getElementById('root')
if (!root) throw new Error('the page has no #root element')

render(
  () => (
    <>
      <App />
      <ConcivWidget />
    </>
  ),
  root,
)
