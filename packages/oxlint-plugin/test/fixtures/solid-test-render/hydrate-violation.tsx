import {hydrate} from 'solid-js/web'
import {test} from 'vitest'
import type {JSX} from 'solid-js'

function hydrateApp(ui: () => JSX.Element, host: HTMLElement): () => void {
  return hydrate(ui, host)
}

test('hydrates', () => {
  hydrateApp(() => <div>hi</div>, document.body)
})
