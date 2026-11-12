import {render} from 'solid-js/web'
import {test} from 'vitest'

function mount(ui) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return render(ui, host)
}

test('mounts', () => {
  mount(() => <div>hi</div>)
})
