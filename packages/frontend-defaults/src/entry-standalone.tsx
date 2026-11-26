import {render} from 'solid-js/web'
import {ConcivApp, createBrowserEngine, openBrowserDraftStore} from './frontend-defaults.js'
import {readSettingsInit} from './data/settings.js'

function start(root: HTMLElement): void {
  const params = new URLSearchParams(window.location.search)
  const engine = createBrowserEngine({apiBase: params.get('core') ?? ''})
  render(
    () => (
      <ConcivApp
        platform={{
          engine: engine.engine,
          connect: engine.connect,
          navigation: 'browser',
          root: document,
          settings: readSettingsInit(params.get('settings') ?? ''),
          draftStore: openBrowserDraftStore,
        }}
      />
    ),
    root,
  )
}

const root = document.getElementById('app')
if (root) start(root)
