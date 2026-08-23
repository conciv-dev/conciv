import '@conciv/ui-kit-system/tokens.css'
import {expect, test} from 'vitest'
import {render} from '@solidjs/testing-library'
import {ThinkingBubble} from '../src/pane/indicators.js'

test('the thinking bubble renders its three dots', () => {
  const {container} = render(() => <ThinkingBubble />)
  expect(container.querySelectorAll('span')).toHaveLength(3)
})
