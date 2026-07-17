import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {useChat} from '@tanstack/ai-solid'
import {ChatProvider, useComposer} from '../../store/chat-context.js'
import {storyConnection} from '../../store/story-connection.js'
import {Composer} from '../composer/composer.js'
import {SelectionToolbar} from './selection-toolbar.js'

const meta: Meta = {title: 'ui-kit-chat/primitives/SelectionToolbar'}
export default meta
type Story = StoryObj

function DraftEcho(): JSX.Element {
  const composer = useComposer()
  return <div>draft: {composer.text()}</div>
}

function App(): JSX.Element {
  const chat = useChat({connection: storyConnection()})
  let source: HTMLParagraphElement | undefined
  return (
    <ChatProvider chat={chat}>
      <Composer.Root>
        <p
          ref={(node) => {
            source = node
          }}
          class="text-[0.8125rem] text-pw-text"
        >
          the missing await on line twelve
        </p>
        <button
          type="button"
          onClick={() => {
            const selection = document.getSelection()
            if (source && selection) {
              selection.removeAllRanges()
              selection.selectAllChildren(source)
            }
          }}
        >
          select
        </button>
        <SelectionToolbar.Root class="flex gap-1">
          <SelectionToolbar.Quote class="text-[0.75rem] text-pw-accent-link">Quote</SelectionToolbar.Quote>
        </SelectionToolbar.Root>
        <DraftEcho />
      </Composer.Root>
    </ChatProvider>
  )
}

export const QuoteSelection: Story = {
  render: () => <App />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByText('select'))
    await waitFor(() => expect(c.getByRole('button', {name: 'Quote selection'})).toBeVisible())
    await userEvent.click(c.getByRole('button', {name: 'Quote selection'}))
    await waitFor(() => expect(c.getByText(/draft: > the missing await on line twelve/)).toBeVisible())
  },
}
