import '@conciv/ui-kit-system/tokens.css'
import {expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {render} from '@solidjs/testing-library'
import {ThinkingBubble, ThinkingSpinner} from '../src/pane/indicators.js'

test('the thinking bubble renders its three dots', () => {
  const {container} = render(() => <ThinkingBubble />)
  expect(container.querySelectorAll('span')).toHaveLength(3)
})

test('the thinking spinner announces itself as a status with an accessible label', async () => {
  render(() => <ThinkingSpinner />)
  const status = page.getByRole('status', {name: 'Assistant is thinking'})
  await expect.element(status).toBeVisible()
  await expect.element(status).toHaveTextContent('thinking')
})
