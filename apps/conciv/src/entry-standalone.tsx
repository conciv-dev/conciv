import {render} from 'solid-js/web'
import {ConcivApp} from './index.js'
import {readSettingsInit} from './data/settings.js'

const params = new URLSearchParams(window.location.search)
const core = params.get('core') ?? ''
const root = document.getElementById('app')

if (root)
  render(
    () => (
      <ConcivApp
        platform={{
          engine: () => ({kind: 'bound', apiBase: core}),
          navigation: 'browser',
          root: document,
          settings: readSettingsInit(params.get('settings') ?? ''),
        }}
      />
    ),
    root,
  )
