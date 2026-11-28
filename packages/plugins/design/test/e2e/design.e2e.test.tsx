import {describe, expect} from 'vitest'
import {screen, waitForElementToBeRemoved, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {test, TestLLM} from '@conciv/backend-test-utils'
import {createFakeEngine} from '@internal/test-utils'
import {createExtensionTester, useFakeEngine} from '@internal/frontend-test-utils'
import {renderTestApp} from '@internal/frontend-test-utils/app'
import design from '../../src/plugin-experimental.js'

describe('the user gives the design plugin a Figma key', () => {
  const HERO = 'https://www.figma.com/design/HERO/Site?node-id=100-1170'
  const PRIVATE = 'Your key stays private'
  const PRIVATE_DESCRIPTION =
    'The key is saved on this computer and used only to call Figma. The agent and the chat only ever see it hidden.'

  test('the failed design_get card takes a key, says the agent can try again, opens settings where the saved key shows hidden and is removed', async ({
    createEngine,
  }) => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['@conciv/plugin-design']})
    await engine.reply(
      TestLLM.toolCall('c1', 'execute_typescript', {
        typescriptCode: `return await external_design_get(${JSON.stringify({figma: HERO})})`,
      }),
      TestLLM.text('Figma needs a key'),
    )
    await renderTestApp({engine})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'Build the hero')
    expect(input).toHaveFocus()
    const finished = await engine.event('session.execution.succeeded')
    await user.keyboard('{Enter}')
    await finished.arrived
    expect(await screen.findByText('Figma needs a key')).toBeVisible()

    const card = await screen.findByRole('region', {name: 'Read the design'})
    expect(within(card).getByRole('alert')).toHaveTextContent('Figma needs a key to read this frame.')
    expect(card).not.toHaveTextContent('the Figma key is missing')
    expect(within(card).getByText(PRIVATE)).toBeVisible()
    expect(within(card).getByText(PRIVATE_DESCRIPTION)).toBeVisible()
    const field = within(card).getByLabelText('Figma API key')
    await user.click(field)
    expect(field).toHaveFocus()
    await user.keyboard('figd_typed-by-the-user')
    await user.click(within(card).getByRole('button', {name: 'Save key'}))
    expect(await within(card).findByText('Key saved. Ask the agent to try again.')).toBeVisible()
    expect(field).toHaveValue('')

    await user.click(within(card).getByRole('button', {name: 'Open settings'}))
    expect(await screen.findByRole('heading', {name: 'Figma'})).toBeVisible()
    const saved = await screen.findByText('Saved key, hidden')
    expect(saved).toBeVisible()
    expect(screen.queryByText('figd_typed-by-the-user')).not.toBeInTheDocument()
    const removed = waitForElementToBeRemoved(saved)
    await user.click(screen.getByRole('button', {name: 'Remove Figma'}))
    await removed
  })

  test('the design_get card Figma refused says the saved key was refused and asks for a new one', async () => {
    const user = userEvent.setup()
    const engine = useFakeEngine(
      createFakeEngine({
        handlers: {
          integration: {
            get: () => ({
              location: {directory: '/workspace'},
              data: {
                id: 'figma',
                name: 'Figma',
                methods: [
                  {type: 'key', label: 'Figma API key'},
                  {type: 'env', names: ['FIGMA_API_KEY']},
                ],
                connections: [],
              },
            }),
          },
          credential: {list: () => []},
        },
      }),
    )
    await createExtensionTester({
      engine,
      plugins: [{id: '@conciv/plugin-design', plugin: design}],
    }).renderToolCards({
      tool: 'design_get',
      input: {figma: HERO},
      metadata: {},
      status: 'error',
      error: 'Figma refused the token: Invalid token',
    })

    const card = await screen.findByRole('region', {name: 'Read the design'})
    expect(within(card).getByRole('alert')).toHaveTextContent('Figma refused the saved key.')
    expect(card).not.toHaveTextContent('Invalid token')
    expect(within(card).getByText(PRIVATE)).toBeVisible()
    expect(within(card).getByText(PRIVATE_DESCRIPTION)).toBeVisible()
    const field = within(card).getByLabelText('Figma API key')
    await user.click(field)
    expect(field).toHaveFocus()
    expect(within(card).getByRole('button', {name: 'Open settings'})).toBeVisible()
  })

  test('the settings say the engine reads FIGMA_API_KEY, and a key saved there is listed before it', async ({
    createEngine,
  }) => {
    const user = userEvent.setup()
    const engine = await createEngine({plugins: ['@conciv/plugin-design']}, {env: {FIGMA_API_KEY: 'figd_engine-env'}})
    await renderTestApp({
      engine,
      initialEntries: [`/panel/${engine.session.id}/settings/plugins/design:figma?open=true`],
    })

    expect(await screen.findByRole('heading', {name: 'Figma'})).toBeVisible()
    expect(await screen.findByText('FIGMA_API_KEY')).toBeVisible()
    expect(screen.getByText(PRIVATE)).toBeVisible()
    expect(screen.getByText(PRIVATE_DESCRIPTION)).toBeVisible()
    const field = screen.getByLabelText('Figma API key')
    await user.click(field)
    expect(field).toHaveFocus()
    await user.keyboard('figd_saved{Enter}')
    expect(await screen.findByText('Key saved.')).toBeVisible()
    expect(await screen.findByText('Saved key, hidden')).toBeVisible()
    expect(screen.getByText('FIGMA_API_KEY')).toBeVisible()
  })
})
