import {describe, expect, it, test} from 'vitest'
import {screen, within} from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import {createEngine, TestLLM} from '@conciv/plugin-testkit'
import {createEngineRouterHistory, mount} from '@conciv/plugin-testkit/browser'

describe('attaching text files', () => {
  test('pasted files show as chips, Backspace and Remove take them off, and the sent message carries the kept file', async () => {
    const user = userEvent.setup({delay: null})
    const engine = await createEngine()
    await engine.reply(TestLLM.text('Read them'))
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.click(input)
    const clipboard = new DataTransfer()
    clipboard.items.add(new File(['Buy milk'], 'notes.txt', {type: 'text/plain'}))
    clipboard.items.add(new File(['Step one'], 'plan.md', {type: 'text/plain'}))
    clipboard.items.add(new File(['noise'], 'extra.log', {type: 'text/plain'}))
    expect(input).toHaveFocus()
    await user.paste(clipboard)
    expect(await screen.findByRole('button', {name: 'notes.txt'})).toBeVisible()
    expect(await screen.findByRole('button', {name: 'plan.md'})).toBeVisible()
    expect(await screen.findByRole('button', {name: 'extra.log'})).toBeVisible()

    expect(input).toHaveFocus()
    await user.keyboard('{Backspace}')
    expect(screen.queryByRole('button', {name: 'extra.log'})).not.toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'plan.md'})).toBeVisible()
    await user.click(screen.getByRole('button', {name: 'Remove plan.md'}))
    expect(screen.queryByRole('button', {name: 'plan.md'})).not.toBeInTheDocument()

    await user.type(input, 'Read my notes')
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    const reply = await screen.findByRole('article', {name: /^Reply to: Read my notes/})
    expect(await within(reply).findByText('Read them')).toBeVisible()
    const requests = await engine.requests()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.messages.at(-1)).toMatchObject({
      role: 'user',
      content: 'Read my notes\n\nAttachment notes.txt:\nBuy milk',
    })
  })
})

describe('the send caps', () => {
  it.each([
    {
      cap: 'more than 16 attachments',
      files: Array.from({length: 17}, (_, index) => new File(['line'], `part-${index}.txt`, {type: 'text/plain'})),
      notice: 'Too many attachments. Remove some and send again.',
    },
    {
      cap: 'a message over the socket budget',
      files: Array.from(
        {length: 3},
        (_, index) => new File(['\u0000'.repeat(1_048_576)], `dump-${index}.log`, {type: 'text/plain'}),
      ),
      notice: 'Message too large to send. Remove an attachment or shorten it.',
    },
  ])('$cap is refused with a notice, and the message stays in the composer', async ({files, notice}) => {
    const user = userEvent.setup({delay: null})
    const engine = await createEngine()
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'Look at these')
    const clipboard = new DataTransfer()
    for (const file of files) clipboard.items.add(file)
    expect(input).toHaveFocus()
    await user.paste(clipboard)
    expect(await screen.findByRole('button', {name: files.at(-1)?.name})).toBeVisible()
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(await screen.findByText(notice)).toBeVisible()
    expect(input).toHaveTextContent('Look at these')
    expect(screen.getByRole('button', {name: files.at(0)?.name})).toBeVisible()
    expect(await engine.requests()).toHaveLength(0)
  })
})

describe('an attachment that cannot be sent', () => {
  test('a text file over the 1MB limit is marked failed, Enter leaves the message in the composer unsent, and it sends once the file is removed', async () => {
    const user = userEvent.setup({delay: null})
    const engine = await createEngine()
    await engine.reply(TestLLM.text('Read it'))
    await mount({engine, history: createEngineRouterHistory({initialEntries: ['/panel/latest?open=true']})})

    const input = await screen.findByRole('textbox', {name: 'Message the conciv agent'})
    await user.type(input, 'Read the log')
    const clipboard = new DataTransfer()
    clipboard.items.add(new File(['a'.repeat(1_048_577)], 'big.log', {type: 'text/plain'}))
    expect(input).toHaveFocus()
    await user.paste(clipboard)
    expect(await screen.findByRole('button', {name: 'big.log exceeds the 1MB text limit'})).toBeVisible()

    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(input).toHaveTextContent('Read the log')
    expect(screen.getByRole('button', {name: 'big.log exceeds the 1MB text limit'})).toBeVisible()

    await user.click(screen.getByRole('button', {name: 'Remove big.log'}))
    await user.click(input)
    expect(input).toHaveFocus()
    await user.keyboard('{Enter}')
    const reply = await screen.findByRole('article', {name: /^Reply to: Read the log/})
    expect(await within(reply).findByText('Read it')).toBeVisible()
    const requests = await engine.requests()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.messages.at(-1)).toMatchObject({role: 'user', content: 'Read the log'})
  })
})
