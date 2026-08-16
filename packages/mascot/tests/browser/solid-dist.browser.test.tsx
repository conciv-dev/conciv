import {render} from '@solidjs/testing-library'
import {expect, it} from 'vitest'
import {Mascot} from '../../dist/solid/index.js'

const partsIn = (container: HTMLElement, part: string): HTMLElement[] => [
  ...container.querySelectorAll<HTMLElement>(`[data-scope="mascot"][data-part="${part}"]`),
]

it('renders the whole robot from the built solid entry', () => {
  const {container} = render(() => (
    <Mascot>
      <Mascot.Eyes id="built-eyes" />
    </Mascot>
  ))
  expect(partsIn(container, 'head')).toHaveLength(1)
  expect(partsIn(container, 'antenna')).toHaveLength(1)
  expect(partsIn(container, 'eyes').map((eyes) => eyes.id)).toEqual(['built-eyes'])
})
