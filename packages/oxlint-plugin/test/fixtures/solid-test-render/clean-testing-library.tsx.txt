import {render} from '@solidjs/testing-library'
import {test} from 'vitest'

test('mounts', () => {
  render(() => <div>hi</div>)
})
