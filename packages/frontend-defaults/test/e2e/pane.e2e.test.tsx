import {describe, expect, test} from 'vitest'
import {page, userEvent as browserInput} from 'vitest/browser'
import {screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createFakeEngine, FakeLLM} from '@internal/test-utils'
import {approveFromElsewhere, sendFromElsewhere, uiAnswers} from '../utils/engine-client.js'
import {PANE_SESSION, SESSION_ADDRESS} from '../utils/sample-data.js'
import {paneEngine} from '../utils/sample-engines.js'
import {mountShell, shellEngine} from '../utils/mount-shell.js'
import {localBundle, releaseTrainSlotsPlugin, reviewNotesPlugin} from '../utils/sample-plugins.js'
import releaseTrain from '../fixtures/plugins/release-train/plugin-experimental.js?raw'

describe('a saved session that failed', () => {
  test('the run failure shows again when the user comes back to the session, with its Retry', async () => {
    const engine = paneEngine()
    engine.reply(FakeLLM.failAfter(new Error('The model is unavailable')))
    await sendFromElsewhere(engine, 'Are you there')
    await mountShell({engine, initialEntries: [SESSION_ADDRESS]})

    expect(await screen.findByRole('article', {name: 'You: Are you there'})).toBeVisible()
    const alert = await screen.findByRole('alert', {name: 'The model is unavailable'})
    expect(within(alert).getByRole('button', {name: 'Retry'})).toBeVisible()
  })
})

describe('a reply with a diagram', () => {
  test('the user reads a drawn diagram, a code block as code, and a diagram that fails to draw as its source in plain text', async () => {
    const user = userEvent.setup()
    const engine = shellEngine(createFakeEngine())
    engine.reply(
      FakeLLM.text(
        '```mermaid\nthis is not a diagram\n```\n\n```mermaid\ngraph TD\n  A[Start] --> B[Done]\n```\n\n```ts\nconst total = 1 + 1\n```\n\nOne of them draws.',
      ),
    )
    await mountShell({engine})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Draw both')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    const reply = await screen.findByRole('article', {name: 'Reply to: Draw both'})

    expect(
      await within(reply).findByText(
        (_, element) =>
          element?.tagName === 'PRE' &&
          element.getAttribute('aria-busy') === null &&
          element.textContent?.trim() === 'this is not a diagram',
      ),
    ).toBeVisible()
    expect(await within(reply).findByRole('graphics-document')).toBeVisible()
    expect(within(reply).getByText('Start')).toBeVisible()
    expect(within(reply).getByText('Done')).toBeVisible()
    expect(within(reply).getAllByRole('graphics-document')).toHaveLength(1)
    expect(within(reply).getByText('this is not a diagram')).toBeVisible()
    await expect
      .element(page.getByRole('article', {name: 'Reply to: Draw both'}).getByText('const total = 1 + 1'))
      .toBeVisible()
  })
})

describe('a long saved session', () => {
  test('the user scrolls to the start, earlier messages load in order, and Latest brings the end back', async () => {
    await page.viewport(1280, 500)
    const engine = paneEngine()
    for (const index of Array.from({length: 26}, (_, offset) => offset + 1)) {
      engine.reply(
        FakeLLM.text(
          `Answer ${index}\n\nThe migration moves each table in its own step, checks the row counts on both sides, and keeps the old table readable until the new one has served a full day of traffic without a single error.`,
        ),
      )
      await sendFromElsewhere(engine, `Question ${index}`)
    }
    await mountShell({engine, initialEntries: [SESSION_ADDRESS]})

    const last = await screen.findByRole('article', {name: 'Reply to: Question 26'})
    expect(await within(last).findByText('Answer 26')).toBeVisible()
    expect(screen.queryByRole('article', {name: 'Reply to: Question 1'})).not.toBeInTheDocument()
    const latest = page.getByRole('button', {name: 'Scroll to bottom', includeHidden: true})
    await expect.element(latest).toBeDisabled()

    await browserInput.click(last)
    expect(screen.getByRole('log')).toHaveFocus()
    await browserInput.keyboard('{Home}')
    expect(await screen.findByRole('article', {name: 'Reply to: Question 1'})).toBeVisible()
    await expect.element(latest).toBeEnabled()
    await expect.element(latest).toBeVisible()
    await expect.element(latest).toHaveTextContent('Latest')
    expect(screen.getByRole('log')).toHaveFocus()
    await browserInput.keyboard('{Home}')
    await expect.element(page.getByRole('article', {name: 'You: Question 1'})).toBeInViewport()
    const rows = screen.getAllByRole('article')
    expect(rows[0]).toHaveAccessibleName('You: Question 1')
    expect(rows[1]).toHaveAccessibleName('Reply to: Question 1')
    expect(rows[2]).toHaveAccessibleName('You: Question 2')
    expect(rows[3]).toHaveAccessibleName('Reply to: Question 2')

    await latest.click()
    expect(await screen.findByText('Answer 26')).toBeVisible()
    await expect.element(latest).toBeDisabled()
  })
})

describe('a fresh session', () => {
  test('the user starts a conversation from a starter', async () => {
    const user = userEvent.setup()
    const engine = shellEngine(createFakeEngine())
    engine.reply(FakeLLM.text('This page is a demo shop'))
    await mountShell({engine})

    expect(await screen.findByText('How can I help you today?')).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Explain this page'}))

    expect(await screen.findByRole('article', {name: 'You: Explain this page'})).toBeVisible()
    const reply = await screen.findByRole('article', {name: 'Reply to: Explain this page'})
    expect(await within(reply).findByText('This page is a demo shop')).toBeVisible()
    expect(screen.queryByText('How can I help you today?')).not.toBeInTheDocument()
    expect(screen.getByRole('separator', {name: 'New session'})).toBeVisible()
  })
})

describe('a markdown reply', () => {
  test('the user reads a reply with a heading, a list and inline code', async () => {
    const user = userEvent.setup()
    const engine = shellEngine(createFakeEngine())
    engine.reply(FakeLLM.text('## Plan\n\n- Read the page\n- Change the color\n\nRun `pnpm test` after.'))
    await mountShell({engine})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Make a plan')
    await user.click(screen.getByRole('button', {name: 'Send message'}))

    expect(await screen.findByRole('article', {name: 'You: Make a plan'})).toBeVisible()
    const reply = await screen.findByRole('article', {name: 'Reply to: Make a plan'})
    expect(await within(reply).findByText(/after\./)).toBeVisible()
    expect(within(reply).getByRole('heading', {name: 'Plan'})).toBeVisible()
    const list = within(reply).getByRole('list')
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchTextContent('Read the page')
    expect(items[1]).toMatchTextContent('Change the color')
    expect(within(reply).getByRole('code')).toMatchTextContent('pnpm test')
  })
})

describe('a reply that thinks before it answers', () => {
  test('the user reads the plan row with its first line, the whole plan below it, and the trace summed up as reasoning', async () => {
    const user = userEvent.setup()
    const engine = paneEngine()
    engine.reply(
      FakeLLM.thinking('Read the cart first\nThen check the price'),
      FakeLLM.text('The fern costs ten euros'),
    )
    await mountShell({engine})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'What does the fern cost')
    await user.click(screen.getByRole('button', {name: 'Send message'}))

    const reply = await screen.findByRole('article', {name: 'Reply to: What does the fern cost'})
    expect(await within(reply).findByText('The fern costs ten euros')).toBeVisible()
    expect(within(reply).getByRole('button', {name: /Hide trace/})).toMatchTextContent('reasoning')
    const trace = within(reply).getByRole('list', {name: 'Execution trace'})
    expect(within(trace).getByText('plan')).toBeVisible()
    expect(within(trace).getByText('Read the cart first')).toBeVisible()
    expect(within(trace).getByText(/Then check the price/)).toBeVisible()
  })
})

describe('a message with no words', () => {
  test('a note sent alone reads as a note', async () => {
    const user = userEvent.setup()
    const engine = shellEngine(createFakeEngine())
    engine.reply(FakeLLM.text('The header is sticky now'))
    await mountShell({engine, plugins: [reviewNotesPlugin]})

    await user.click(await screen.findByRole('button', {name: 'Review'}))
    expect(await screen.findByRole('list', {name: 'Notes'})).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByText('The header is sticky now')).toBeVisible()
    const sent = screen.getByRole('article', {name: 'You: 1 note'})
    expect(within(sent).getByRole('list', {name: 'Notes on this message'})).toBeVisible()
  })
})

describe('stopping and sending again', () => {
  test('the user stops a streaming reply, keeps its text marked stopped, and sends again', async () => {
    const user = userEvent.setup()
    const engine = paneEngine()
    const thinking = engine.gate()
    engine.reply(FakeLLM.partialText('Halfway there. '), FakeLLM.hang(), FakeLLM.text('Short answer'))
    await mountShell({engine})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Take your time')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    await thinking.started
    expect(await screen.findByText('Thinking…')).toBeVisible()
    thinking.release()
    const stopped = await screen.findByRole('article', {name: 'Reply to: Take your time'})
    expect(await within(stopped).findByText(/there\./)).toBeVisible()
    expect(screen.getByText('Responding…')).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Stop generating'}))

    expect(await screen.findByRole('separator', {name: 'Stopped'})).toBeVisible()
    const kept = screen.getByRole('article', {name: 'Reply to: Take your time'})
    expect(kept).toMatchTextContent('Halfway there.')
    expect(kept).not.toMatchTextContent('The very last words')
    expect(screen.getByRole('button', {name: 'Send message'})).toBeVisible()

    await user.type(screen.getByRole('textbox', {name: 'Message the conciv agent'}), 'Be quick')
    await user.click(screen.getByRole('button', {name: 'Send message'}))

    const reply = await screen.findByRole('article', {name: 'Reply to: Be quick'})
    expect(await within(reply).findByText('Short answer')).toBeVisible()
    expect(screen.getByRole('separator', {name: 'Stopped'})).toBeVisible()
    expect(screen.getByRole('article', {name: 'Reply to: Take your time'})).toMatchTextContent('Halfway there.')
  })

  test('a Stop before the first word shows STOPPING and Stopping… until the run ends, then STOPPED, and the next turn leaves no reply for the stopped one', async () => {
    const user = userEvent.setup()
    const engine = shellEngine(createFakeEngine())
    const gate = engine.gate()
    engine.reply(FakeLLM.text('Here it is'))
    await mountShell({engine})

    const bar = await screen.findByRole('toolbar', {name: 'Session status'})
    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Wait for it')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    await gate.started
    await user.click(await screen.findByRole('button', {name: 'Stop generating'}))

    expect(await within(bar).findByText('STOPPING')).toBeVisible()
    expect(screen.getByRole('button', {name: 'Stopping the run'})).toBeVisible()
    expect(await within(bar).findByText('STOPPED')).toBeVisible()
    expect(screen.queryByRole('button', {name: 'Stopping the run'})).not.toBeInTheDocument()
    expect(await screen.findByRole('separator', {name: 'Stopped'})).toBeVisible()
    expect(screen.getByRole('button', {name: 'Send message'})).toBeVisible()

    await user.type(screen.getByRole('textbox', {name: 'Message the conciv agent'}), 'Try again')
    await user.click(screen.getByRole('button', {name: 'Send message'}))

    const reply = await screen.findByRole('article', {name: 'Reply to: Try again'})
    expect(await within(reply).findByText('Here it is')).toBeVisible()
    expect(screen.queryByRole('article', {name: 'Reply to: Wait for it'})).not.toBeInTheDocument()
  })
})

describe('the actions under a reply', () => {
  test('the user copies a reply and hears it, then asks for the reply again and reads the new answer', async () => {
    const user = userEvent.setup()
    const engine = shellEngine(createFakeEngine())
    engine.reply(FakeLLM.text('The first answer'), FakeLLM.text('The second answer'))
    await mountShell({engine})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Answer me')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    const reply = await screen.findByRole('article', {name: 'Reply to: Answer me'})
    expect(await within(reply).findByText('The first answer')).toBeVisible()
    const actions = await screen.findByRole('toolbar', {name: 'Message actions'})
    await user.click(within(actions).getByRole('button', {name: 'Copy'}))
    expect(await screen.findByText('Copied the message')).toBeVisible()

    await user.click(within(actions).getByRole('button', {name: 'Refresh'}))
    expect(await screen.findByText('The second answer')).toBeVisible()
    expect(screen.queryByText('The first answer')).not.toBeInTheDocument()
  })
})

describe('refreshing the conversation', () => {
  test('the session menu refuses a refresh while a reply runs, shows the reply token counts, then refreshes and says so', async () => {
    const user = userEvent.setup()
    const engine = paneEngine()
    const answer = engine.gate()
    engine.reply(FakeLLM.usage({inputTokens: 1200, outputTokens: 300}), FakeLLM.text('Here is the page'))
    await mountShell({engine})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Read the page')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    await answer.started
    await user.click(await screen.findByRole('button', {name: /, session options$/}))
    const options = await screen.findByRole('dialog', {name: 'Session options'})
    const refresh = within(options).getByRole('button', {name: 'Refresh the conversation'})
    expect(refresh).toBeDisabled()

    answer.release()
    expect(await screen.findByText('Here is the page')).toBeVisible()
    expect(await screen.findByRole('button', {name: 'Send message'})).toBeVisible()
    expect(refresh).toBeEnabled()
    expect(await within(options).findByText('Input')).toBeVisible()
    expect(within(options).getByText('Output')).toBeVisible()
    await user.click(refresh)

    expect(await screen.findByText('Conversation refreshed.')).toBeVisible()
    expect(screen.getByText('Here is the page')).toBeVisible()
  })
})

describe('how full the model context is', () => {
  test('after a reply the session menu shows the share of the context window used and a bar filled to it', async () => {
    const user = userEvent.setup()
    const engine = paneEngine()
    engine.reply(
      FakeLLM.usage({contextTokens: 24_000, contextWindow: 200_000, inputTokens: 24_000}),
      FakeLLM.text('Counted'),
    )
    await mountShell({engine})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Count the tokens')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByText('Counted')).toBeVisible()
    expect(await screen.findByRole('button', {name: 'Send message'})).toBeVisible()
    await user.click(screen.getByRole('button', {name: /, session options$/}))

    const options = await screen.findByRole('dialog', {name: 'Session options'})
    expect(await within(options).findByText('12%')).toBeVisible()
    expect(within(options).getByText('24K / 200K')).toBeVisible()
    expect(within(options).getByRole('progressbar', {name: 'Model context usage', value: {now: 12}})).toBeVisible()
  })
})

describe('a conversation too long for the model', () => {
  test('the user compacts from the overflow row, watches it compact, and goes on after the Context compacted mark', async () => {
    const user = userEvent.setup()
    const engine = paneEngine()
    engine.reply(FakeLLM.failAfter(Object.assign(new Error('prompt is too long'), {code: 'context_overflow'})))
    const compaction = engine.gate()
    engine.reply(FakeLLM.text('A summary of the talk so far'), FakeLLM.text('Back to work'))
    await mountShell({engine})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Keep going')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    const overflow = await screen.findByRole('alert', {
      name: 'This conversation is too long for the model. Compact it to keep going.',
    })
    await user.click(within(overflow).getByRole('button', {name: 'Compact conversation'}))
    await compaction.started

    expect(await screen.findByRole('separator', {name: 'Compacting…'})).toBeVisible()
    expect(screen.getByRole('status', {name: 'Compacting context…'})).toBeVisible()
    compaction.release()
    expect(await screen.findByRole('separator', {name: 'Context compacted'})).toBeVisible()
    expect(
      screen.queryByRole('alert', {name: 'This conversation is too long for the model. Compact it to keep going.'}),
    ).not.toBeInTheDocument()

    await user.type(screen.getByRole('textbox', {name: 'Message the conciv agent'}), 'Go on')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    const reply = await screen.findByRole('article', {name: 'Reply to: Go on'})
    expect(await within(reply).findByText('Back to work')).toBeVisible()
  })
})

describe('the agent asks for permission', () => {
  test('the ask is announced and listed with its target, the run waits, Allow once lets the tool run, and the answered card leaves the list', async () => {
    const user = userEvent.setup()
    const engine = paneEngine()
    engine.reply(FakeLLM.execute('c1', 'release_ship', {branch: 'main'}), FakeLLM.text('Main is shipped'))
    await mountShell({engine})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Ship main')
    await user.click(screen.getByRole('button', {name: 'Send message'}))

    const list = await screen.findByRole('list', {name: 'Permission requests'})
    const ask = within(list).getByRole('group', {name: 'Permission request'})
    expect(ask).toMatchTextContent('release_ship main')
    expect(within(ask).getByRole('button', {name: 'Allow always'})).toBeVisible()
    expect(within(ask).getByRole('button', {name: 'Deny'})).toBeVisible()
    expect(await screen.findByText('conciv is asking for permission.')).toBeVisible()
    const bar = screen.getByRole('toolbar', {name: 'Session status'})
    expect(within(bar).getByRole('status')).toHaveTextContent('WAITING')
    expect(screen.queryByRole('status', {name: 'Agent activity'})).not.toBeInTheDocument()

    await user.click(within(ask).getByRole('button', {name: 'Allow once'}))

    expect(await screen.findByText('Main is shipped')).toBeVisible()
    expect(screen.queryByRole('group', {name: 'Permission request'})).not.toBeInTheDocument()
  })

  test('a panel opened while a reply waits on its ask shows the reply so far, and an ask answered from another window leaves it without its buttons and the whole reply once', async () => {
    const engine = paneEngine()
    engine.reply(FakeLLM.execute('c1', 'release_ship', {branch: 'main'}), FakeLLM.text('Main is shipped'))
    const replied = sendFromElsewhere(engine, 'Ship main')
    await mountShell({engine})

    const reply = await screen.findByRole('article', {name: 'Reply to: Ship main'})
    expect(await within(reply).findByRole('img', {name: 'running'})).toBeVisible()
    expect(await screen.findByRole('button', {name: 'Allow once'})).toBeVisible()

    await approveFromElsewhere(engine)
    await replied

    expect(await screen.findByText('Main is shipped')).toBeVisible()
    expect(screen.getAllByText('Main is shipped')).toHaveLength(1)
    expect(screen.getAllByRole('article', {name: 'Reply to: Ship main'})).toHaveLength(1)
    expect(screen.queryByRole('button', {name: 'Allow once'})).not.toBeInTheDocument()
    expect(screen.queryByRole('button', {name: 'Deny'})).not.toBeInTheDocument()
  })

  test('Deny refuses an ask and the tool reads denied, then on the focused card Escape denies the next ask and Ctrl+Enter allows the one after', async () => {
    const user = userEvent.setup()
    const engine = paneEngine()
    engine.reply(
      FakeLLM.execute('c1', 'release_ship', {branch: 'main'}),
      FakeLLM.execute('c2', 'release_ship', {branch: 'next'}),
      FakeLLM.execute('c3', 'release_ship', {branch: 'beta'}),
      FakeLLM.text('Beta is shipped'),
    )
    await mountShell({engine})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Ship a branch')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    const denied = await screen.findByRole('group', {name: 'Permission request'})
    expect(denied).toMatchTextContent('release_ship main')
    await user.click(within(denied).getByRole('button', {name: 'Deny'}))

    await expect.element(page.getByRole('group', {name: 'Permission request'})).toMatchTextContent('release_ship next')
    expect((await screen.findAllByRole('img', {name: 'denied'})).at(-1)).toBeVisible()
    const first = screen.getByRole('group', {name: 'Permission request'})
    await user.click(first)
    expect(first).toHaveFocus()
    await user.keyboard('{Escape}')

    await expect.element(page.getByRole('group', {name: 'Permission request'})).toMatchTextContent('release_ship beta')
    const second = screen.getByRole('group', {name: 'Permission request'})
    await user.click(second)
    expect(second).toHaveFocus()
    await user.keyboard('{Control>}{Enter}{/Control}')

    expect(await screen.findByText('Beta is shipped')).toBeVisible()
    expect(screen.queryByRole('group', {name: 'Permission request'})).not.toBeInTheDocument()
  })

  test('an ask that cannot be saved offers no Allow always', async () => {
    const user = userEvent.setup()
    const engine = paneEngine({tools: {release_rollback: {ask: {always: false}}}})
    await mountShell({engine})

    const reply = engine
      .outside({client: 'conciv-test', session: PANE_SESSION})
      .call('release_rollback', {branch: 'main'})
    const ask = await screen.findByRole('group', {name: 'Permission request'})
    expect(within(ask).getByRole('button', {name: 'Allow once'})).toBeVisible()
    expect(within(ask).queryByRole('button', {name: 'Allow always'})).not.toBeInTheDocument()

    await user.click(within(ask).getByRole('button', {name: 'Allow once'}))
    await expect(reply).resolves.toEqual({content: [{type: 'text', text: '{}'}]})
  })

  test('Stop while the card is open takes the ask away', async () => {
    const user = userEvent.setup()
    const engine = paneEngine()
    engine.reply(FakeLLM.execute('c1', 'release_ship', {branch: 'main'}))
    await mountShell({engine})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Ship main')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByRole('group', {name: 'Permission request'})).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Stop generating'}))

    expect(await screen.findByRole('button', {name: 'Send message'})).toBeVisible()
    expect(screen.queryByRole('button', {name: 'Allow once'})).not.toBeInTheDocument()
  })
})

describe('the engine goes away for a moment', () => {
  test('while the engine restarts Refresh waits and a failed reply hides its error, and once it is back the error and its Retry return and Retry gets the new reply', async () => {
    const user = userEvent.setup()
    const engine = shellEngine(createFakeEngine())
    engine.reply(
      FakeLLM.text('Here is the page'),
      FakeLLM.failAfter(new Error('The model is unavailable')),
      FakeLLM.text('I am back'),
    )
    await mountShell({engine})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Read the page')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByText('Here is the page')).toBeVisible()
    const refresh = page.getByRole('toolbar', {name: 'Message actions'}).getByRole('button', {name: 'Refresh'})
    await expect.element(refresh).toBeEnabled()

    engine.drop()
    expect(await screen.findByText('conciv lost connection to the engine.')).toBeVisible()
    await expect.element(refresh).toBeDisabled()
    engine.recover()
    await expect.element(page.getByText('conciv lost connection to the engine.')).not.toBeInTheDocument()
    await expect.element(refresh).toBeEnabled()

    await user.type(screen.getByRole('textbox', {name: 'Message the conciv agent'}), 'Read it again')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    const failed = await screen.findByRole('alert', {name: 'The model is unavailable'})
    expect(within(failed).getByRole('button', {name: 'Retry'})).toBeVisible()

    engine.drop()
    expect(await screen.findByText('conciv lost connection to the engine.')).toBeVisible()
    await expect.element(page.getByRole('alert', {name: 'The model is unavailable'})).not.toBeInTheDocument()
    engine.recover()
    const back = await screen.findByRole('alert', {name: 'The model is unavailable'})
    await user.click(within(back).getByRole('button', {name: 'Retry'}))

    const reply = await screen.findByRole('article', {name: 'Reply to: Read it again'})
    expect(await within(reply).findByText('I am back')).toBeVisible()
    expect(screen.queryByRole('alert', {name: 'The model is unavailable'})).not.toBeInTheDocument()
  })
})

describe('the session status chip', () => {
  test('a fresh session shows no chip, a run shows RUNNING and RUNNING 1/2 with a queued message, then DONE, and a failed run shows FAILED with its reason', async () => {
    const user = userEvent.setup()
    const engine = shellEngine(createFakeEngine())
    const gate = engine.gate()
    engine.reply(
      FakeLLM.text('First answer'),
      FakeLLM.text('Second answer'),
      FakeLLM.failAfter(new Error('The model is unavailable')),
    )
    await mountShell({engine})

    const bar = await screen.findByRole('toolbar', {name: 'Session status'})
    expect(within(bar).queryByRole('status')).not.toBeInTheDocument()
    expect(within(bar).getByText('--')).toBeVisible()

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'First task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    await gate.started
    expect(await within(bar).findByRole('status')).toHaveTextContent('RUNNING')

    await user.type(input, 'Second task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(await within(bar).findByText('RUNNING 1/2')).toBeVisible()

    gate.release()
    const second = await screen.findByRole('article', {name: 'Reply to: Second task'})
    expect(await within(second).findByText('Second answer')).toBeVisible()
    expect(await within(bar).findByText('DONE')).toBeVisible()
    expect(within(bar).getByText(/^\d{2}:\d{2}$/)).toBeVisible()
    expect(within(bar).queryByText('--')).not.toBeInTheDocument()

    await user.type(input, 'Third task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('alert', {name: 'The model is unavailable'})).toBeVisible()
    const failed = page.getByRole('toolbar', {name: 'Session status', exact: true}).getByRole('status')
    await expect.element(failed).toHaveTextContent('FAILED')
    await expect.element(failed).toHaveAccessibleDescription('The model is unavailable')
  })

  test('an edit that failed changed no file, so the status bar counts no files or lines', async () => {
    const user = userEvent.setup()
    const engine = shellEngine(createFakeEngine())
    engine.reply(
      FakeLLM.toolError(
        'c1',
        'Edit',
        {file_path: 'src/app.ts', old_string: 'one', new_string: 'two\nthree'},
        'File does not exist.',
      ),
      FakeLLM.text('The edit did not go through'),
    )
    await mountShell({engine})

    const bar = await screen.findByRole('toolbar', {name: 'Session status'})
    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Change the app')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByText('The edit did not go through')).toBeVisible()
    expect(await within(bar).findByText('DONE')).toBeVisible()

    expect(within(bar).queryByText('1 file')).not.toBeInTheDocument()
    expect(within(bar).queryByText('+2')).not.toBeInTheDocument()
    expect(within(bar).queryByText('−1')).not.toBeInTheDocument()
  })
})

describe('the agent asks a choice', () => {
  test('the user picks one of the offered answers and the agent goes on with it', async () => {
    const user = userEvent.setup()
    const engine = paneEngine()
    engine.reply(
      FakeLLM.execute('c1', 'conciv_ui', {kind: 'choices', question: 'Which color?', options: ['Red', 'Blue']}),
      FakeLLM.text('Blue it is'),
    )
    await mountShell({engine})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Pick a color with me')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByText('Which color?')).toBeVisible()
    expect(screen.getByText('Rendered choices')).toBeVisible()
    expect(screen.getByRole('status', {name: 'Agent activity'})).toMatchTextContent('conciv_ui')
    expect(screen.getAllByRole('img', {name: 'running'}).at(-1)).toBeVisible()
    expect(screen.queryByRole('img', {name: 'complete'})).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', {name: 'Blue'}))

    expect(await screen.findByText('Blue it is')).toBeVisible()
    expect(screen.queryByRole('status', {name: 'Agent activity'})).not.toBeInTheDocument()
    expect(screen.queryByRole('img', {name: 'running'})).not.toBeInTheDocument()
    expect(screen.getAllByRole('img', {name: 'complete'}).at(-1)).toBeVisible()
    const reply = screen.getByRole('article', {name: 'Reply to: Pick a color with me'})
    expect(within(reply).getByText('Blue')).toBeVisible()
    expect(within(reply).queryByRole('button', {name: 'Red'})).not.toBeInTheDocument()
    expect(await uiAnswers(engine)).toEqual(['Blue'])
  })
})

describe('the user stops while the agent asks', () => {
  test('the open question ends as interrupted at once and stays so after the next reply', async () => {
    const user = userEvent.setup()
    const engine = paneEngine()
    engine.reply(
      FakeLLM.execute('c1', 'conciv_ui', {kind: 'choices', question: 'Which color?', options: ['Red', 'Blue']}),
      FakeLLM.text('Here it is'),
    )
    await mountShell({engine})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Pick a color with me')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByRole('button', {name: 'Red'})).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Stop generating'}))

    expect(await screen.findByRole('separator', {name: 'Stopped'})).toBeVisible()
    expect(await screen.findByText('Tool execution interrupted')).toBeVisible()
    expect(screen.queryByRole('button', {name: 'Red'})).not.toBeInTheDocument()
    expect(screen.queryByRole('img', {name: 'running'})).not.toBeInTheDocument()

    await user.type(screen.getByRole('textbox', {name: 'Message the conciv agent'}), 'Never mind')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByText('Here it is')).toBeVisible()
    await user.click(screen.getByRole('button', {name: /Show trace/}))
    await expect.element(page.getByText('Tool execution interrupted', {exact: true})).toBeVisible()
    expect(screen.queryByRole('button', {name: 'Red'})).not.toBeInTheDocument()
    expect(screen.queryByRole('img', {name: 'running'})).not.toBeInTheDocument()
  })
})

describe('a plugin draws its own tool cards', () => {
  test('a plugin card shows open with the icon the plugin declares, a failed call draws the plugin error card, a card that throws falls back to the generic card, and the icon draws on its settings tab and leaves with the plugin', async () => {
    const user = userEvent.setup()
    const engine = paneEngine({
      bundles: [localBundle('release-train', releaseTrain, {server: true})],
      tools: {
        release_check: {run: () => ({verdict: 'ready'})},
        release_block: {
          run: () => {
            throw new Error('The release train is frozen')
          },
        },
        release_notes: {run: () => ({notes: 'Faster login'})},
      },
    })
    engine.reply(
      FakeLLM.execute('c1', 'release_check', {branch: 'main'}),
      FakeLLM.execute('c2', 'release_block', {branch: 'main'}),
      FakeLLM.execute('c3', 'release_notes', {branch: 'main'}),
      FakeLLM.text('Main is checked'),
    )
    await mountShell({engine})
    expect(await screen.findByText('Release train: on time')).toBeVisible()

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Can main ship')
    await user.click(screen.getByRole('button', {name: 'Send message'}))

    expect(await screen.findByText('Main is checked')).toBeVisible()
    const reply = screen.getByRole('article', {name: 'Reply to: Can main ship'})
    expect(await within(reply).findByText('Release card for main')).toBeVisible()
    expect(within(reply).getByText(/^Release held: .*The release train is frozen/)).toBeVisible()
    expect(within(reply).getByRole('button', {name: /Called release_notes/})).toBeVisible()

    const href = reply.querySelector('use')?.getAttribute('href') ?? ''
    expect(href).toMatch(/^#/)
    expect(document.querySelector(`symbol${href}`)).toHaveAttribute('viewBox', '0 0 16 16')
    const sprite = document.querySelector(`symbol${href}`)?.parentElement

    await user.click(screen.getByRole('link', {name: 'Settings'}))
    const schedule = await screen.findByRole('tab', {name: 'Release schedule'})
    expect(schedule.querySelector('use')).toHaveAttribute('href', href)
    await user.click(screen.getByRole('tab', {name: 'Plugins'}))
    await user.click(await screen.findByRole('switch', {name: 'release-train'}))

    await expect.element(page.getByRole('tab', {name: 'Release schedule'})).not.toBeInTheDocument()
    expect(document.querySelector(`symbol${href}`)).not.toBeInTheDocument()
    expect(sprite?.isConnected).toBe(false)
  })
})

describe('a plugin fills the session header and status', () => {
  test('the header slot and the status slot show what the plugin draws', async () => {
    await mountShell({engine: shellEngine(createFakeEngine()), plugins: [releaseTrainSlotsPlugin]})

    expect(await screen.findByText('Release train: on time')).toBeVisible()
    expect(await screen.findByText('Next train at noon')).toBeVisible()
  })
})

describe('opening a tool card while the turn goes on', () => {
  test('the user opens the card of a tool with no card of its own and hides the trace while the reply waits; the trace stays hidden when the answer arrives, and shown again the card is still open', async () => {
    const user = userEvent.setup()
    const engine = paneEngine({tools: {release_window: {run: () => ({window: 'noon to two'})}}})
    const toolCall = engine.gate()
    engine.reply(FakeLLM.execute('c1', 'release_window', {branch: 'main'}))
    const answer = engine.gate()
    engine.reply(FakeLLM.text('The window is set'))
    await mountShell({engine})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'When can we ship')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    await toolCall.started
    toolCall.release()
    await answer.started
    const reply = await screen.findByRole('article', {name: 'Reply to: When can we ship'})
    expect(await within(reply).findAllByText('"noon to two"')).toHaveLength(1)
    await user.click(within(reply).getByRole('button', {name: /Called release_window/}))
    const opened = page.elementLocator(reply).getByText('"noon to two"', {exact: true})
    await expect.element(opened).toHaveLength(2)
    await expect.element(opened.last()).toBeVisible()

    await user.click(within(reply).getByRole('button', {name: /Hide trace/}))
    answer.release()

    expect(await screen.findByText('The window is set')).toBeVisible()
    expect(within(reply).getByRole('button', {name: /Show trace/})).toHaveFocus()
    await expect.element(page.getByRole('list', {name: 'Execution trace'})).not.toBeInTheDocument()
    await user.click(within(reply).getByRole('button', {name: /Show trace/}))
    expect(within(reply).getAllByText('"noon to two"')).toHaveLength(2)
    expect(within(reply).getAllByText('"noon to two"').at(-1)).toBeVisible()
    const durations = await within(reply).findAllByText(/^\d+\.\ds$/)
    expect(durations.at(-1)).toBeVisible()
  })
})

describe('the agent asks other kinds of question', () => {
  test('a multi-select question submits the pressed options and a typed other, and Submit waits for a choice', async () => {
    const user = userEvent.setup()
    const engine = paneEngine()
    engine.reply(
      FakeLLM.execute('c1', 'conciv_ui', {
        kind: 'choices',
        question: 'Which toppings?',
        options: ['Olives', 'Basil', 'Garlic'],
        multiSelect: true,
        allowOther: true,
      }),
      FakeLLM.text('Pizza ordered'),
    )
    await mountShell({engine})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Order a pizza')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByText('Which toppings?')).toBeVisible()
    expect(screen.getByRole('button', {name: 'Submit'})).toBeDisabled()
    await user.click(screen.getByRole('button', {name: 'Olives'}))
    await user.click(screen.getByRole('button', {name: 'Basil'}))
    await user.click(screen.getByRole('button', {name: 'Olives'}))
    expect(await screen.findByRole('button', {name: 'Basil', pressed: true})).toBeVisible()
    expect(await screen.findByRole('button', {name: 'Olives', pressed: false})).toBeVisible()
    await user.type(screen.getByRole('textbox', {name: 'Other'}), 'Chili')
    await user.click(screen.getByRole('button', {name: 'Submit'}))

    expect(await screen.findByText('Pizza ordered')).toBeVisible()
    expect(await uiAnswers(engine)).toEqual([['Basil', 'Chili']])
  })

  test.each([
    {
      kind: 'confirm',
      input: {kind: 'confirm', question: 'Delete the build folder?', detail: 'rm -r dist'},
      prompt: 'Clean the build',
      question: 'Delete the build folder?',
      detail: 'rm -r dist',
      other: 'Deny',
      button: 'Approve',
      reply: 'Build folder deleted',
      value: 'yes',
    },
    {
      kind: 'diff',
      input: {
        kind: 'diff',
        question: 'Apply this change?',
        file: 'src/title.ts',
        before: 'export const title = 1',
        after: 'export const title = 2',
      },
      prompt: 'Bump the title',
      question: 'Apply this change?',
      detail: 'src/title.ts',
      other: 'Apply',
      button: 'Reject',
      reply: 'Change dropped',
      value: 'reject',
    },
  ])(
    'a $kind question shows its detail, offers $other, and $button sends its answer',
    async ({input, prompt, question, detail, other, button, reply, value}) => {
      const user = userEvent.setup()
      const engine = paneEngine()
      engine.reply(FakeLLM.execute('c1', 'conciv_ui', input), FakeLLM.text(reply))
      await mountShell({engine})

      await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), prompt)
      await user.click(screen.getByRole('button', {name: 'Send message'}))
      expect(await screen.findByText(question)).toBeVisible()
      await expect.element(page.getByText(detail)).toBeVisible()
      expect(screen.getByRole('button', {name: other})).toBeVisible()
      await user.click(screen.getByRole('button', {name: button}))

      expect(await screen.findByText(reply)).toBeVisible()
      expect(await uiAnswers(engine)).toEqual([value])
    },
  )

  test('a form question sends the typed text and the first select option by default, and shows the answers', async () => {
    const user = userEvent.setup()
    const engine = paneEngine()
    engine.reply(
      FakeLLM.execute('c1', 'conciv_ui', {
        kind: 'form',
        title: 'New page',
        fields: [
          {name: 'path', label: 'Path', type: 'text'},
          {name: 'layout', label: 'Layout', type: 'select', options: ['Wide', 'Narrow']},
        ],
      }),
      FakeLLM.text('Page created'),
    )
    await mountShell({engine})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Make a page')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    const path = await screen.findByRole('textbox', {name: 'Path'})
    await user.type(path, '/pricing')
    expect(screen.getByRole('textbox', {name: 'Path'})).toBe(path)
    expect(path).toHaveFocus()
    expect(screen.getByRole('combobox', {name: 'Layout'})).toMatchTextContent('Wide')
    await user.click(screen.getByRole('button', {name: 'Submit'}))

    expect(await screen.findByText('Page created')).toBeVisible()
    expect(await uiAnswers(engine)).toEqual([{path: '/pricing', layout: 'Wide'}])
    const reply = screen.getByRole('article', {name: 'Reply to: Make a page'})
    expect(within(reply).getByText('/pricing')).toBeVisible()
  })
})

describe('the agent runs a program', () => {
  test('each run shows as an exec card with its first code line and status, the logs and result of one and the error of the other', async () => {
    const user = userEvent.setup()
    const engine = paneEngine()
    engine.reply(
      FakeLLM.toolCall(
        'c1',
        'execute_typescript',
        {typescriptCode: "console.log('counting the items')\nreturn 2 + 3"},
        {success: true, result: 5, logs: ['counting the items']},
      ),
      FakeLLM.toolCall(
        'c2',
        'execute_typescript',
        {typescriptCode: "throw new Error('The cart is empty')"},
        {success: false, logs: [], error: {name: 'Error', message: 'The cart is empty'}},
      ),
      FakeLLM.text('Five items'),
    )
    await mountShell({engine})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Count them')
    await user.click(screen.getByRole('button', {name: 'Send message'}))

    expect(await screen.findByText('Five items')).toBeVisible()
    const reply = screen.getByRole('article', {name: 'Reply to: Count them'})
    expect(within(reply).getByText('2 execs')).toBeVisible()
    const passed = within(reply).getByRole('button', {name: /console\.log\('counting the items'\)/})
    expect(within(passed).getByRole('img', {name: 'succeeded'})).toBeVisible()
    expect(within(passed).getByText('exec')).toBeVisible()
    expect(within(passed).getByText('ok')).toBeVisible()
    const failed = within(reply).getByRole('button', {name: /throw new Error\('The cart is empty'\)/})
    expect(within(failed).getByRole('img', {name: 'failed'})).toBeVisible()
    expect(within(failed).getByText('error')).toBeVisible()
    await expect.element(page.getByRole('group', {name: 'Output'}).getByText('counting the items')).toBeVisible()
    await expect.element(page.getByRole('group', {name: 'result.json'}).getByText('5')).toBeVisible()
    await expect.element(page.getByRole('group', {name: 'Error output'}).getByText(/The cart is empty/)).toBeVisible()
  })
})

describe('an outside agent calls a tool', () => {
  test('a panel opened while an outside call waits on its ask shows the running call tagged with the agent, its result once allowed, and a later call in the open panel too, and each agent gets its result', async () => {
    const user = userEvent.setup()
    const engine = shellEngine(
      createFakeEngine({
        sessions: [{id: PANE_SESSION, title: 'New session'}],
        tools: {
          release_ship: {ask: {title: 'release_ship main', always: true}, run: () => ({shipped: true})},
          release_window: {run: () => ({window: 'noon to two'})},
        },
      }),
    )
    const outside = engine.outside({client: 'conciv-test', session: PANE_SESSION})
    const shipReply = outside.call('release_ship', {branch: 'main'})
    await mountShell({engine, initialEntries: [SESSION_ADDRESS]})

    expect(await screen.findByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()
    expect((await screen.findAllByText('from conciv-test')).at(0)).toBeVisible()
    expect(screen.getByRole('img', {name: 'running'})).toBeVisible()
    expect(screen.queryByText('ok')).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', {name: 'Allow once'}))

    expect(await shipReply).toMatchObject({content: [{type: 'text', text: expect.stringContaining('shipped')}]})
    expect(await screen.findByText('ok')).toBeVisible()
    expect(screen.getAllByText('from conciv-test')).toHaveLength(2)

    const windowReply = await outside.call('release_window', {branch: 'main'})

    expect(windowReply).toMatchObject({content: [{type: 'text', text: expect.stringContaining('noon to two')}]})
    expect(await screen.findByRole('button', {name: /Called release_window/})).toBeVisible()
    const windowCall = screen.getByRole('button', {name: /external_release_window/})
    expect(await within(windowCall).findByText('ok')).toBeVisible()
    expect(screen.getAllByText('ok')).toHaveLength(2)
    expect(screen.getAllByText('from conciv-test')).toHaveLength(4)
    expect(screen.queryByRole('article', {name: /^You:/})).not.toBeInTheDocument()
  })
})

describe('the agent opens a file in the editor', () => {
  test('the open card names the file and line and says it opened, and the editor gets the file at that line', async () => {
    const user = userEvent.setup()
    const opened: unknown[] = []
    const engine = paneEngine({
      tools: {
        open: {
          run: (input) => {
            opened.push(input)
            return {opened: true}
          },
        },
      },
    })
    engine.reply(FakeLLM.execute('c1', 'open', {file: 'src/app.ts', line: 12}), FakeLLM.text('It is open'))
    await mountShell({engine})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Show me the app file')
    await user.click(screen.getByRole('button', {name: 'Send message'}))

    expect(await screen.findByText('It is open')).toBeVisible()
    const reply = screen.getByRole('article', {name: 'Reply to: Show me the app file'})
    expect(within(reply).getByText('open')).toBeVisible()
    expect(within(reply).getByText('src/app.ts:12')).toBeVisible()
    expect(within(reply).getByText('Opened in your editor.')).toBeVisible()
    expect(opened).toEqual([{file: 'src/app.ts', line: 12}])
  })
})

describe('a notice from a plugin', () => {
  test('a notice shows in the thread: one with a description is its own row under that label and its turn answers, not a message from the user; one with no description, or only spaces, shows no row; and a failed one with no description shows its text as its row', async () => {
    const user = userEvent.setup()
    const engine = paneEngine()
    engine.reply(FakeLLM.text('The build is green'), FakeLLM.text('Shipping it'), FakeLLM.text('Looking into it'))
    await mountShell({engine, initialEntries: [SESSION_ADDRESS]})
    expect(await screen.findByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible()

    await engine.synthetic(PANE_SESSION, {text: 'The build finished in 42 s', description: 'Build finished'})

    expect(await screen.findByRole('note', {name: 'Build finished'})).toBeVisible()
    expect(await screen.findByText('The build is green')).toBeVisible()
    expect(screen.queryByText('The build finished in 42 s')).not.toBeInTheDocument()
    expect(screen.queryByRole('article', {name: /^You:/})).not.toBeInTheDocument()

    await engine.synthetic(PANE_SESSION, {text: 'Quiet note', resume: false})
    await user.type(screen.getByRole('textbox', {name: 'Message the conciv agent'}), 'Ship it')
    await user.click(screen.getByRole('button', {name: 'Send message'}))

    expect(await screen.findByText('Shipping it')).toBeVisible()
    expect(screen.getByRole('article', {name: 'You: Ship it'})).toBeVisible()
    expect(screen.getAllByRole('article', {name: /^You:/})).toHaveLength(1)
    expect(screen.queryByText('Quiet note')).not.toBeInTheDocument()
    expect(screen.getByRole('note', {name: 'Build finished'})).toBeVisible()

    await engine.synthetic(PANE_SESSION, {text: 'Blank label', description: '   ', resume: false})
    await engine.synthetic(PANE_SESSION, {text: 'The deploy failed', metadata: {state: 'error'}})

    expect(await screen.findByText('Looking into it')).toBeVisible()
    expect(screen.getByRole('note', {name: 'The deploy failed'})).toBeVisible()
    expect(screen.getByRole('note', {name: 'Build finished'})).toBeVisible()
    expect(screen.getAllByRole('note')).toHaveLength(2)
    expect(screen.queryByText('Blank label')).not.toBeInTheDocument()
  })
})
