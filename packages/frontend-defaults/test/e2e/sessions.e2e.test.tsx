import {describe, expect, onTestFinished, test, vi} from 'vitest'
import {page, userEvent as browserInput} from 'vitest/browser'
import {screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {resolveModifier} from '@tanstack/hotkeys'
import {ORPCError} from '@orpc/client'
import {createFakeEngine, FakeLLM, type FakeSession} from '@conciv/client/testing'
import {pastSessions} from '../fixtures/past-sessions.js'
import {mountShell, shellEngine} from '../utils/mount-shell.js'
import {
  addSession,
  forgetQuickHeight,
  pagedList,
  pagedPreview,
  reportsUsage,
  sessionRow,
  textMessage,
  titleSentSession,
  twoHarnesses,
} from '../utils/sessions-engine.js'

describe('find and switch sessions', () => {
  test('the user searches the sessions, switches to one and starts a new one', async () => {
    const user = userEvent.setup({delay: null})
    const engine = shellEngine()
    await addSession(engine, 'Alpha')
    await addSession(engine, 'Beta')
    await mountShell({engine})

    await user.click(await screen.findByRole('button', {name: 'Beta, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Beta'}))
    expect(await screen.findByText('Today')).toBeVisible()
    expect(await screen.findByRole('option', {name: /^Alpha, Edited/})).toBeVisible()

    const search = screen.getByRole('combobox', {name: 'Search sessions'})
    await user.type(search, 'zzz')
    expect(await screen.findByText('No sessions match')).toBeVisible()
    await user.tripleClick(search)
    await user.keyboard('Alp')
    expect(await screen.findByRole('option', {name: /^Alpha, Edited/})).toBeVisible()
    await expect.element(page.getByRole('option', {name: /^Beta, Edited/})).not.toBeInTheDocument()

    await user.tripleClick(search)
    await user.keyboard('x'.repeat(201))
    expect(await screen.findByText("Couldn't load sessions")).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'Clear search'}))
    await expect.element(search).toHaveValue('')
    await expect.element(search).toHaveFocus()
    expect(await screen.findByRole('option', {name: /^Beta, Edited/})).toBeVisible()
    expect(screen.queryByText("Couldn't load sessions")).not.toBeInTheDocument()

    await user.click(await screen.findByRole('option', {name: /^Alpha, Edited/}))
    expect(await screen.findByText('Switched to Alpha')).toBeVisible()
    expect(await screen.findByRole('button', {name: 'Alpha, session options'})).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'Alpha, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Alpha'}))
    await user.click(await screen.findByRole('button', {name: 'New session'}))
    expect(await screen.findByText('Started a new session')).toBeVisible()

    await addSession(engine, 'Gamma')
    await user.click(await screen.findByRole('button', {name: 'New session, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: New session'}))
    expect(await screen.findByRole('option', {name: /^Gamma, Edited/})).toBeVisible()
  })
})

describe('a run in the list', () => {
  test('the picker marks the running session and names each harness, the user starts a new session, previews the running one, and hears the reply finish as the row stops running', async () => {
    const user = userEvent.setup({delay: null})
    const engine = shellEngine(createFakeEngine({handlers: {meta: twoHarnesses()}}))
    const gate = engine.gate()
    engine.reply(FakeLLM.text('Done'))
    await mountShell({engine})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Keep going')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    await gate.started

    await user.click(await screen.findByRole('button', {name: 'New session, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: New session'}))
    expect(await screen.findByRole('option', {name: /, Edited .* · alpha, running$/})).toBeVisible()
    await user.click(await screen.findByRole('button', {name: 'New session'}))
    expect(await screen.findByText('Started a new session')).toBeVisible()
    await titleSentSession(engine, 'Keep going')
    expect(await screen.findByRole('button', {name: 'New session, session options'})).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'New session, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: New session'}))
    expect(await screen.findByRole('option', {name: /^Keep going, Edited .* · alpha, running$/})).toBeVisible()
    const search = screen.getByRole('combobox', {name: 'Search sessions'})
    await user.click(search)
    expect(search).toHaveFocus()
    const current = screen.getByRole('option', {name: /^New session, Edited/})
    await expect.element(search).toHaveAttribute('aria-activedescendant', current.id)
    await user.keyboard('{ArrowDown}')
    const preview = await screen.findByRole('dialog', {name: 'Preview of Keep going'})
    expect(await within(await within(preview).findByRole('log')).findByText('Keep going')).toBeVisible()

    await user.keyboard('{Escape}')
    await expect.element(page.getByRole('dialog', {name: 'Preview of Keep going', exact: true})).not.toBeInTheDocument()
    gate.release()
    expect(await screen.findByText('conciv replied.')).toBeVisible()
    expect(await screen.findByRole('option', {name: /^Keep going, Edited .* · alpha$/})).toBeVisible()
  })
})

describe('paging the list', () => {
  test('the user moves past the first page of sessions and the next page loads', async () => {
    const user = userEvent.setup({delay: null})
    const rows: FakeSession[] = [
      {id: 'ses_pagednew'},
      ...Array.from({length: 31}, (_, offset) => ({id: `ses_paged${31 - offset}`, title: `Session ${31 - offset}`})),
    ]
    const engine = shellEngine(
      createFakeEngine({
        sessions: rows,
        handlers: {
          sessions: {
            list: pagedList(
              rows.map((row, index) => sessionRow(row.id, row.title ?? 'New session', rows.length - index)),
            ),
          },
        },
      }),
    )
    await mountShell({engine})

    await user.click(await screen.findByRole('button', {name: 'New session, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: New session'}))
    expect(await screen.findByRole('option', {name: /^Session 31, Edited/})).toBeVisible()

    const search = screen.getByRole('combobox', {name: 'Search sessions'})
    await user.click(search)
    const current = screen.getByRole('option', {name: /^New session, Edited/})
    await expect.element(search).toHaveAttribute('aria-activedescendant', current.id)
    await user.keyboard('{ArrowDown>29/}')
    expect(await screen.findByRole('option', {name: /^Session 1, Edited/})).toBeVisible()
  })
})

describe('swap a quick pane’s session', () => {
  test('the user picks another session from a quick pane’s pill', async () => {
    const user = userEvent.setup()
    const engine = shellEngine()
    await addSession(engine, 'Alpha')
    await addSession(engine, 'Beta')
    await mountShell({engine, initialEntries: ['/quick']})

    const terminal = await screen.findByRole('dialog', {name: 'conciv quick terminal'})
    await user.click(await within(terminal).findByRole('button', {name: 'Session: Beta'}))
    await user.click(await screen.findByRole('option', {name: /^Alpha, Edited/}))

    expect(await screen.findByText('Switched to Alpha')).toBeVisible()
    expect(await within(terminal).findByRole('button', {name: 'Session: Alpha'})).toBeVisible()
  })
})

describe('preview a session', () => {
  test('the user highlights an earlier session, reads its thread in the preview, moves between the thread and the search with the Alt arrows and closes it with Escape', async () => {
    const user = userEvent.setup()
    const engine = shellEngine()
    engine.reply(FakeLLM.text('The plan has three steps'))
    await mountShell({engine})

    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Show me the plan')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByText('conciv replied.')).toBeVisible()
    await titleSentSession(engine, 'Show me the plan')

    await user.click(await screen.findByRole('button', {name: 'Show me the plan, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Show me the plan'}))
    await user.click(await screen.findByRole('button', {name: 'New session'}))
    expect(await screen.findByText('Started a new session')).toBeVisible()

    await user.click(await screen.findByRole('button', {name: 'New session, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: New session'}))
    await user.click(await screen.findByRole('combobox', {name: 'Search sessions'}))
    await user.keyboard('{ArrowDown}')
    const preview = await screen.findByRole('dialog', {name: 'Preview of Show me the plan'})
    expect(await within(preview).findByText('The plan has three steps')).toBeVisible()
    expect(within(preview).getAllByText('Show me the plan')).toHaveLength(2)

    const search = screen.getByRole('combobox', {name: 'Search sessions'})
    expect(search).toHaveFocus()
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}')
    await expect.element(within(preview).getByRole('log')).toHaveFocus()
    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}')
    await expect.element(search).toHaveFocus()
    expect(screen.getByRole('dialog', {name: 'Preview of Show me the plan'})).toBeVisible()

    await user.keyboard('{Escape}')
    await expect
      .element(page.getByRole('dialog', {name: 'Preview of Show me the plan', exact: true}))
      .not.toBeInTheDocument()
    expect(screen.getByRole('combobox', {name: 'Search sessions'})).toBeVisible()
  })
})

describe('preview a session that has no messages', () => {
  test('the user highlights a session nobody wrote in and the preview says it couldn’t load the session, with a Retry', async () => {
    const user = userEvent.setup()
    const engine = shellEngine(
      createFakeEngine({
        handlers: {
          sessions: {
            preview: () => {
              throw new ORPCError('NOT_FOUND', {message: 'session not found'})
            },
          },
        },
      }),
    )
    await addSession(engine, 'Alpha')
    await addSession(engine, 'Beta')
    await mountShell({engine})

    await user.click(await screen.findByRole('button', {name: 'Beta, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Beta'}))
    expect(await screen.findByRole('option', {name: /^Alpha, Edited/})).toBeVisible()
    const search = screen.getByRole('combobox', {name: 'Search sessions'})
    await user.click(search)
    expect(search).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    const preview = await screen.findByRole('dialog', {name: 'Preview of Alpha'})
    const failed = await within(preview).findByRole('alert')
    expect(within(failed).getByText('Couldn’t load this session.')).toBeVisible()
    expect(within(failed).getByRole('button', {name: 'Retry'})).toBeVisible()
  })
})

describe('past sessions the CLI started', () => {
  test('the picker opens on the search and All projects from the address, copies another project’s resume command, and with All projects off and the search cleared files the sessions under Yesterday and Earlier and finds one by a word of its transcript', async () => {
    const user = userEvent.setup()
    const dayBefore = new Date()
    dayBefore.setDate(dayBefore.getDate() - 1)
    vi.setSystemTime(dayBefore)
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const engine = shellEngine(createFakeEngine(pastSessions()))
    await mountShell({engine, initialEntries: ['/panel/latest?open=true&sessionSearch=checkout&allProjects=true']})

    await user.click(await screen.findByRole('button', {name: 'Alpha, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: Alpha'}))
    expect(await screen.findByRole('combobox', {name: 'Search sessions'})).toHaveValue('checkout')
    expect(await screen.findByRole('switch', {name: 'All projects', checked: true})).toBeVisible()
    expect(screen.queryByRole('switch', {name: 'All projects', checked: false})).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', {name: 'Session: Alpha'}))
    await expect.element(page.getByRole('combobox', {name: 'Search sessions', exact: true})).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', {name: 'Session: Alpha'}))
    const search = await screen.findByRole('combobox', {name: 'Search sessions'})
    expect(search).toHaveValue('checkout')
    expect(screen.getByRole('switch', {name: 'All projects', checked: true})).toBeVisible()
    expect(
      await screen.findByRole('option', {
        name: /^Ship the checkout page, Edited .* · started externally, in storefront, select to copy the command that opens it there$/,
      }),
    ).toBeVisible()

    await user.click(search)
    expect(search).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    const preview = await screen.findByRole('dialog', {name: 'Preview of Ship the checkout page'})
    expect(await within(preview).findByText('In the cart page')).toBeVisible()
    expect(within(preview).getByText('storefront')).toBeVisible()

    const copy = within(preview).getByRole('button', {name: 'Copy resume command'})
    await user.click(copy)
    expect(await within(preview).findByRole('button', {name: 'Copied'})).toBeVisible()
    expect(await within(screen.getByRole('status', {name: 'conciv announcements'})).findByText('Copied')).toBeVisible()
    expect(copy).toHaveFocus()
    await user.keyboard('{Escape}')
    await expect
      .element(page.getByRole('dialog', {name: 'Preview of Ship the checkout page', exact: true}))
      .not.toBeInTheDocument()

    await user.click(screen.getByRole('option', {name: /^Ship the checkout page, Edited/}))
    expect(await screen.findByRole('tooltip', {name: 'Copied'})).toBeVisible()
    expect(screen.getByRole('option', {name: /^Ship the checkout page, Edited/})).toBeVisible()

    await user.click(screen.getByRole('switch', {name: 'All projects', checked: true}))
    expect(await screen.findByText('No sessions match')).toBeVisible()
    expect(screen.queryByRole('option', {name: /^Ship the checkout page/})).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', {name: 'Clear search'}))
    await expect.element(search).toHaveValue('')
    expect(await screen.findByRole('option', {name: /^Alpha, Edited .* · started in conciv$/})).toBeVisible()
    expect(
      await screen.findByRole('option', {name: /^Fix the login form, Edited .* · started externally$/}),
    ).toBeVisible()
    expect(await screen.findByRole('option', {name: /^Tidy the footer, Edited .* · started externally$/})).toBeVisible()
    expect(screen.queryByRole('option', {name: /^Ship the checkout page/})).not.toBeInTheDocument()
    expect(screen.getByText('Today')).toBeVisible()
    expect(screen.getByText('Yesterday')).toBeVisible()
    expect(screen.getByText('Earlier')).toBeVisible()

    await user.type(search, 'cookie')
    expect(
      await screen.findByRole('option', {
        name: /^Fix the login form, Edited/,
        description: /The session cookie expires too early/,
      }),
    ).toBeVisible()
    await expect
      .element(page.getByRole('option', {name: /^Fix the login form, Edited/}).getByRole('mark'))
      .toHaveTextContent('cookie')
    expect(screen.getByText('Yesterday')).toBeVisible()
    await expect.element(page.getByText('Today', {exact: true})).not.toBeInTheDocument()
    await expect.element(page.getByText('Earlier', {exact: true})).not.toBeInTheDocument()
    await expect.element(page.getByRole('option', {name: /^Tidy the footer/})).not.toBeInTheDocument()

    await user.tripleClick(search)
    await user.keyboard('links')
    expect(await screen.findByRole('option', {name: /^Tidy the footer, Edited/})).toBeVisible()
    expect(screen.getByText('Earlier')).toBeVisible()
    await expect.element(page.getByText('Yesterday', {exact: true})).not.toBeInTheDocument()
  })
})

describe('a long past session in the preview', () => {
  test('the user previews the newest page, moves into the thread with Alt+ArrowRight, goes to its start and the earlier messages load', async () => {
    const user = userEvent.setup()
    const messages = Array.from({length: 25}, (_, index) => index + 1).flatMap((number) => [
      textMessage(`question-${number}`, 'user', `Question ${number}`),
      textMessage(`answer-${number}`, 'assistant', `Answer ${number}`),
    ])
    const engine = shellEngine(
      createFakeEngine({
        sessions: [{id: 'ses_migrationnew'}, {id: 'ses_pastmigration', title: 'Plan the migration', messages}],
        handlers: {sessions: {preview: pagedPreview(messages)}},
      }),
    )
    await mountShell({engine})

    await user.click(await screen.findByRole('button', {name: 'New session, session options'}))
    await user.click(await screen.findByRole('button', {name: 'Session: New session'}))
    expect(await screen.findByRole('option', {name: /^Plan the migration, Edited/})).toBeVisible()
    const search = screen.getByRole('combobox', {name: 'Search sessions'})
    await user.click(search)
    expect(search).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    const preview = await screen.findByRole('dialog', {name: 'Preview of Plan the migration'})
    expect(await within(preview).findByRole('article', {name: 'Reply to: Question 25'})).toBeVisible()
    expect(within(preview).queryByRole('article', {name: 'You: Question 1'})).not.toBeInTheDocument()

    await user.keyboard('{Alt>}{ArrowRight}{/Alt}')
    await expect.element(within(preview).getByRole('log')).toHaveFocus()
    await browserInput.keyboard('{Home}')
    expect(await within(preview).findByRole('article', {name: 'Reply to: Question 1'})).toHaveTextContent('Answer 1')
    expect(within(preview).getByRole('log')).toHaveFocus()
    await browserInput.keyboard('{Home}')
    expect(await within(preview).findByRole('article', {name: 'You: Question 1'})).toBeVisible()
    expect(within(preview).getByRole('article', {name: 'Reply to: Question 1'})).toBeVisible()
  })
})

describe('open the chat', () => {
  test('the launcher opens the chat on the newest session', async () => {
    const user = userEvent.setup()
    const engine = shellEngine()
    await addSession(engine, 'Older')
    await addSession(engine, 'Newest')
    await mountShell({engine, initialEntries: ['/']})

    await user.click(await screen.findByRole('button', {name: 'Open conciv chat'}))

    expect(await screen.findByRole('button', {name: 'Newest, session options'})).toBeVisible()
  })
})

describe('the launcher while a run works', () => {
  test('the launcher says it is busy until the reply finishes', async () => {
    const user = userEvent.setup()
    const engine = shellEngine()
    const gate = engine.gate()
    engine.reply(FakeLLM.text('Finished'))
    await mountShell({engine, initialEntries: ['/']})

    await user.click(await screen.findByRole('button', {name: 'Open conciv chat', busy: false}))
    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Run something long')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    await gate.started
    await user.click(await screen.findByRole('button', {name: 'Close chat'}))

    expect(await screen.findByRole('button', {name: 'Open conciv chat', busy: true})).toBeVisible()
    expect(screen.queryByRole('button', {name: 'Open conciv chat', busy: false})).not.toBeInTheDocument()

    gate.release()
    expect(await screen.findByRole('button', {name: 'Open conciv chat', busy: false})).toBeVisible()
    expect(screen.queryByRole('button', {name: 'Open conciv chat', busy: true})).not.toBeInTheDocument()
  })
})

describe('the launcher while a run waits', () => {
  test('the launcher tells the user a run waits for their Allow', async () => {
    const user = userEvent.setup()
    const engine = shellEngine(
      createFakeEngine({tools: {release_ship: {ask: {title: 'release_ship main', always: true}}}}),
    )
    engine.reply(FakeLLM.toolCall('c1', 'release_ship', {branch: 'main'}, {shipped: true}), FakeLLM.text('Done'))
    await mountShell({engine, initialEntries: ['/']})

    await user.click(await screen.findByRole('button', {name: 'Open conciv chat'}))
    await user.type(await screen.findByRole('textbox', {name: 'Message the conciv agent'}), 'Ship main')
    await user.click(screen.getByRole('button', {name: 'Send message'}))
    expect(await screen.findByRole('group', {name: 'Permission request'})).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Close chat'}))

    await user.click(await screen.findByRole('button', {name: 'Waiting for approval. Open conciv chat'}))
    const ask = await screen.findByRole('group', {name: 'Permission request'})
    await user.click(within(ask).getByRole('button', {name: 'Allow once'}))

    expect(await screen.findByText('conciv replied.')).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Close chat'}))
    expect(await screen.findByRole('button', {name: 'Open conciv chat'})).toBeVisible()
    expect(screen.queryByRole('button', {name: /^Waiting for approval/})).not.toBeInTheDocument()
  })
})

describe('a run fails with a message queued', () => {
  test('the queued message goes back to the composer when the reply fails', async () => {
    const user = userEvent.setup()
    const engine = shellEngine()
    const gate = engine.gate()
    engine.reply(FakeLLM.failAfter(new Error('The model is unavailable')))
    await mountShell({engine})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'First task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    await gate.started
    await user.type(input, 'Second task')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(await screen.findByText('1 waiting · runs in order')).toBeVisible()

    gate.release()
    expect(await screen.findByRole('alert', {name: 'The model is unavailable'})).toBeVisible()
    expect(await within(input).findByText('Second task')).toBeVisible()
    expect(screen.queryByText('1 waiting · runs in order')).not.toBeInTheDocument()
  })
})

describe('quick terminal', () => {
  test('the user opens the quick terminal on the latest session with the hotkey, splits it with Mod+D, closes one of the two panes, closes it with the hotkey, and reopens it to split and close it with the buttons', async () => {
    const mod = resolveModifier('Mod')
    const user = userEvent.setup()
    const engine = shellEngine()
    await addSession(engine, 'Latest work')
    await mountShell({engine, initialEntries: ['/']})

    expect(await screen.findByRole('button', {name: 'Open conciv chat'})).toBeVisible()
    expect(document.body).toHaveFocus()
    await user.keyboard(`{${mod}>}\`{/${mod}}`)
    const terminal = await screen.findByRole('dialog', {name: 'conciv quick terminal'})
    expect(terminal).toBeVisible()
    expect(await within(terminal).findByRole('button', {name: 'Session: Latest work'})).toBeVisible()

    expect(document.body).toHaveFocus()
    await user.keyboard(`{${mod}>}d{/${mod}}`)
    expect(await within(terminal).findByRole('button', {name: 'Session: New session'})).toBeVisible()
    expect(within(terminal).getAllByRole('button', {name: /^Session: /})).toHaveLength(2)

    await user.click(
      within(screen.getByRole('region', {name: 'Session: New session'})).getByRole('button', {name: 'Close pane'}),
    )
    await expect.element(page.getByRole('region', {name: 'Session: New session', exact: true})).not.toBeInTheDocument()
    expect(screen.getByRole('region', {name: 'Session: Latest work'})).toBeVisible()

    expect(document.body).toHaveFocus()
    await user.keyboard(`{${mod}>}\`{/${mod}}`)
    await expect.element(page.getByRole('dialog', {name: 'conciv quick terminal', exact: true})).not.toBeInTheDocument()

    expect(document.body).toHaveFocus()
    await user.keyboard(`{${mod}>}\`{/${mod}}`)
    const reopened = await screen.findByRole('dialog', {name: 'conciv quick terminal'})
    expect(await within(reopened).findByRole('button', {name: 'Session: Latest work'})).toBeVisible()
    expect(within(reopened).getAllByRole('button', {name: /^Session: /})).toHaveLength(1)

    await user.click(within(reopened).getByRole('button', {name: 'Split pane'}))
    expect(await within(reopened).findByRole('button', {name: 'Session: New session'})).toBeVisible()
    expect(within(reopened).getAllByRole('button', {name: /^Session: /})).toHaveLength(2)

    await user.click(within(reopened).getByRole('button', {name: 'Close quick terminal'}))
    await expect.element(page.getByRole('dialog', {name: 'conciv quick terminal', exact: true})).not.toBeInTheDocument()
  })
})

describe('quick terminal height', () => {
  test('the user resizes the quick terminal from the keyboard down to its floor', async () => {
    const user = userEvent.setup()
    forgetQuickHeight()
    await mountShell({engine: shellEngine(), initialEntries: ['/quick']})

    const handle = await screen.findByRole('separator', {name: 'Resize quick terminal height', value: {now: 416}})
    expect(handle).toBeVisible()
    expect(
      screen.queryByRole('separator', {name: 'Resize quick terminal height', value: {now: 440}}),
    ).not.toBeInTheDocument()

    await user.click(screen.getByText('quick terminal'))
    await user.tab({shift: true})
    await user.tab({shift: true})
    expect(handle).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(
      await screen.findByRole('separator', {name: 'Resize quick terminal height', value: {now: 440}}),
    ).toBeVisible()
    await user.keyboard('{ArrowUp}')
    expect(
      await screen.findByRole('separator', {name: 'Resize quick terminal height', value: {now: 416}}),
    ).toBeVisible()
    await user.keyboard('{ArrowUp>10/}')
    expect(
      await screen.findByRole('separator', {name: 'Resize quick terminal height', value: {now: 200}}),
    ).toBeVisible()
    expect(
      screen.queryByRole('separator', {name: 'Resize quick terminal height', value: {now: 176}}),
    ).not.toBeInTheDocument()
  })

  test('the quick terminal opens at the height the user left it', async () => {
    forgetQuickHeight('300')
    await mountShell({engine: shellEngine(), initialEntries: ['/quick']})

    expect(
      await screen.findByRole('separator', {name: 'Resize quick terminal height', value: {now: 300}}),
    ).toBeVisible()
    expect(
      screen.queryByRole('separator', {name: 'Resize quick terminal height', value: {now: 416}}),
    ).not.toBeInTheDocument()
  })
})

describe('the host turns the quick terminal off', () => {
  const mod = resolveModifier('Mod')

  test('the quick terminal route and hotkey do nothing', async () => {
    const user = userEvent.setup()
    await mountShell({engine: shellEngine(), initialEntries: ['/quick'], settings: {quickTerminal: false}})

    const launcher = await screen.findByRole('button', {name: 'Open conciv chat'})
    expect(launcher).toBeVisible()
    await user.hover(launcher)
    expect(await screen.findByRole('tooltip', {name: 'Open conciv chat'})).toBeVisible()
    expect(screen.queryByRole('dialog', {name: 'conciv quick terminal'})).not.toBeInTheDocument()

    expect(document.body).toHaveFocus()
    await user.keyboard(`{${mod}>}\`{/${mod}}`)
    await user.unhover(launcher)
    await expect.element(page.getByRole('tooltip', {name: 'Open conciv chat'})).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', {name: 'conciv quick terminal'})).not.toBeInTheDocument()
  })

  test('the host moves the quick terminal to its own hotkey', async () => {
    const user = userEvent.setup()
    await mountShell({engine: shellEngine(), initialEntries: ['/'], settings: {quickTerminal: {hotkey: 'Mod+K'}}})

    expect(await screen.findByRole('button', {name: 'Open conciv chat'})).toBeVisible()
    expect(document.body).toHaveFocus()
    await user.keyboard(`{${mod}>}k{/${mod}}`)
    const terminal = await screen.findByRole('dialog', {name: 'conciv quick terminal'})
    expect(terminal).toBeVisible()

    expect(document.body).toHaveFocus()
    await user.keyboard(`{${mod}>}\`{/${mod}}`)
    await user.hover(within(terminal).getByRole('button', {name: 'Split pane'}))
    expect(await screen.findByRole('tooltip', {name: /^Split pane/})).toBeVisible()
    expect(screen.getByRole('dialog', {name: 'conciv quick terminal'})).toBeVisible()
  })
})

describe('quick pane context usage', () => {
  test('after a reply the quick pane shows how much of the model context the session used', async () => {
    const user = userEvent.setup()
    const engine = shellEngine(reportsUsage({inputTokens: 1200, outputTokens: 5}))
    engine.reply(FakeLLM.text('Here is the summary'))
    await mountShell({engine, initialEntries: ['/quick']})

    const terminal = await screen.findByRole('dialog', {name: 'conciv quick terminal'})
    const input = await within(terminal).findByRole('textbox', {name: 'Message the conciv agent'})
    expect(within(terminal).queryByRole('button', {name: 'Model context usage'})).not.toBeInTheDocument()
    await user.type(input, 'Summarise the work')
    await user.click(within(terminal).getByRole('button', {name: 'Send message'}))
    expect(await within(terminal).findByText('Here is the summary')).toBeVisible()

    const usage = await within(terminal).findByRole('button', {name: 'Model context usage'})
    await user.hover(usage)
    const card = await within(terminal).findByRole('group', {name: 'Model context usage'})
    expect(within(card).getByText('Input')).toBeVisible()
    expect(within(card).getByText('Output')).toBeVisible()
    expect(within(usage).getByText(/^\d+(\.\d)?K$/)).toBeVisible()
    expect(within(card).getByText(/^\d+(\.\d)?K$/)).toBeVisible()
    expect(within(card).getByText('5')).toBeVisible()
  })
})

describe('rename a session', () => {
  test('the user hears a rename fail, then renames the session', async () => {
    const user = userEvent.setup()
    await mountShell({engine: shellEngine()})

    expect(await screen.findByRole('button', {name: 'New session, session options'})).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Rename session'}))
    const titleField = await screen.findByRole('textbox', {name: 'Session title'})
    expect(titleField).toHaveValue('New session')
    await expect.element(titleField).toHaveFocus()
    await user.clear(titleField)
    await user.type(titleField, `${'a'.repeat(121)}{Enter}`)

    expect(await screen.findByText('Rename failed')).toBeVisible()
    expect(await screen.findByRole('button', {name: 'New session, session options'})).toBeVisible()

    await user.click(await screen.findByRole('button', {name: 'Rename session'}))
    const retryField = await screen.findByRole('textbox', {name: 'Session title'})
    expect(retryField).toHaveValue('New session')
    await expect.element(retryField).toHaveFocus()
    await user.clear(retryField)
    await user.type(retryField, 'Release notes{Enter}')

    expect(await screen.findByText('Renamed to Release notes')).toBeVisible()
    expect(await screen.findByRole('button', {name: 'Release notes, session options'})).toBeVisible()
  })
})

describe('pop out', () => {
  test('the user is told the pop-out window could not be reopened', async () => {
    await mountShell({
      engine: shellEngine(createFakeEngine({sessions: [{id: 'ses_popout'}]})),
      initialEntries: ['/panel/ses_popout?open=true&popOut=lost'],
    })

    expect(await screen.findByText('The pop-out window could not be reopened.')).toBeVisible()
    expect(screen.getByRole('button', {name: 'Pop out again'})).toBeVisible()
  })
})
