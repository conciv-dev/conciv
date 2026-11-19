import {render} from 'preact'
import {ConcivWidget} from '@conciv/preact'
import './index.css'
import App from './App.tsx'

const container = document.getElementById('root')

if (container) {
  render(
    <>
      <App />
      <ConcivWidget />
    </>,
    container,
  )
}
