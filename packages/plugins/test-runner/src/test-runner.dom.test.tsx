import {test, expect} from 'vitest'
import {screen} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine, TestLLM} from '@conciv/plugin-testkit/node'
import {mount} from '@conciv/plugin-testkit/browser'

test('a user asks the agent, then opens the tests panel', async () => {
  const engine = await createEngine({
    plugins: ['@conciv/plugin-test-runner'],
    replies: [TestLLM.text('done', 'text-done')],
  })
  await mount({engine})
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', {name: 'Open conciv chat'}))
  await user.type(await screen.findByRole('textbox'), 'run the tests{Enter}')
  await expect(screen.findByText('done')).resolves.toBeDefined()
  await user.click(await screen.findByRole('tab', {name: 'Tests'}))
  await expect(screen.findByText('No test run yet')).resolves.toBeDefined()
})
