import {render} from 'solid-js/web'
import {test} from 'vitest'
import type {JSX} from 'solid-js'

function mount(ui: () => JSX.Element): () => void {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return render(ui, host)
}

test('mounts', () => {
  mount(() => <div>hi</div>)
})
