import {describe, expect, test} from 'vitest'
import {page, userEvent as browserInput} from 'vitest/browser'
import {screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('a saved session that failed', () => {
  test('the run failure shows again when the user comes back to the session, with its Retry', async () => {
    const engine = await createEngine()
    await engine.reply(TestLLM.failAfter(new Error('The model is unavailable')))
    await expect(engine.session.send('Are you there')).rejects.toThrow('The model is unavailable')
    await mount({
      engine,
      history: createEngineRouterHistory({initialEntries: [`/panel/${engine.session.id}?open=true`]}),
    })

    expect(await screen.findByRole('article', {name: 'You: Are you there'})).toBeVisible()
    const alert = await screen.findByRole('alert', {name: 'The model is unavailable'})
    expect(within(alert).getByRole('button', {name: 'Retry'})).toBeVisible()
  })
})

describe('a reply with a diagram', () => {
  test('the user reads a mermaid block as a drawn diagram and a code block as code', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(
      TestLLM.text(
        '```mermaid\ngraph TD\n  A[Start] --> B[Done]\n```\n\n```ts\nconst total = 1 + 1\n```\n\nThat is the flow.',
      ),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Draw the flow')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    const reply = await screen.findByRole('article', {name: 'Reply to: Draw the flow'})

    expect(await within(reply).findByRole('graphics-document')).toBeVisible()
    expect(within(reply).getByText('Start')).toBeVisible()
    expect(within(reply).getByText('Done')).toBeVisible()
    await expect
      .element(page.getByRole('article', {name: 'Reply to: Draw the flow'}).getByText('const total = 1 + 1'))
      .toBeVisible()
  })

  test('a diagram that fails to draw shows its source as plain text', async () => {
    const user = userEvent.setup()
    const engine = await createEngine()
    await engine.reply(
      TestLLM.text(
        '```mermaid\nthis is not a diagram\n```\n\n```mermaid\ngraph TD\n  A[Start] --> B[Done]\n```\n\nOne of them draws.',
      ),
    )
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Draw both')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    const reply = await screen.findByRole('article', {name: 'Reply to: Draw both'})

    expect(await within(reply).findByRole('graphics-document')).toBeVisible()
    expect(within(reply).getByText('Start')).toBeVisible()
    expect(within(reply).getAllByRole('graphics-document')).toHaveLength(1)
    expect(within(reply).getByText('this is not a diagram')).toBeVisible()
  })
})

describe('a long saved session', () => {
  test('the user scrolls to the start, earlier messages load in order, and Latest brings the end back', async () => {
    await page.viewport(1280, 500)
    const engine = await createEngine()
    await engine.reply(
      ...Array.from({length: 26}, (_, index) =>
        TestLLM.text(
          `Answer ${index + 1}\n\nThe migration moves each table in its own step, checks the row counts on both sides, and keeps the old table readable until the new one has served a full day of traffic without a single error.`,
        ),
      ),
    )
    for (const index of Array.from({length: 26}, (_, offset) => offset + 1)) {
      await engine.session.send(`Question ${index}`)
    }
    await mount({
      engine,
      history: createEngineRouterHistory({initialEntries: [`/panel/${engine.session.id}?open=true`]}),
    })

    const last = await screen.findByRole('article', {name: 'Reply to: Question 26'})
    expect(await within(last).findByText('Answer 26')).toBeVisible()
    expect(screen.queryByRole('article', {name: 'Reply to: Question 1'})).not.toBeInTheDocument()
    const latest = page.getByRole('button', {name: 'Scroll to bottom', includeHidden: true})
    await expect.element(latest).toBeDisabled()

    await browserInput.click(last)
    expect(screen.getByRole('log')).toHaveFocus()
    await browserInput.keyboard('{Home}')
    expect(await screen.findByRole('article', {name: 'Reply to: Question 1'})).toBeVisible()
    const rows = screen.getAllByRole('article')
    expect(rows[0]).toHaveAccessibleName('You: Question 1')
    expect(rows[1]).toHaveAccessibleName('Reply to: Question 1')
    expect(rows[2]).toHaveAccessibleName('You: Question 2')
    expect(rows[3]).toHaveAccessibleName('Reply to: Question 2')
    await expect.element(latest).toBeEnabled()
    await expect.element(latest).toBeVisible()
    await expect.element(latest).toHaveTextContent('Latest')
    expect(screen.getByRole('log')).toHaveFocus()
    await browserInput.keyboard('{Home}')
    await expect.element(page.getByRole('article', {name: 'You: Question 1'})).toBeInViewport()

    await latest.click()
    expect(await screen.findByText('Answer 26')).toBeVisible()
    await expect.element(latest).toBeDisabled()
  })
})
