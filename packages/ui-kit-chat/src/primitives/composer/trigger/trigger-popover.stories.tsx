import {For, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {useChat} from '@tanstack/ai-solid'
import {ChatProvider} from '../../../store/chat-context.js'
import {storyConnection} from '../../../store/story-connection.js'
import {Composer} from '../composer.js'
import type {DirectiveFormatter, TriggerAdapter, TriggerItem} from './types.js'

const meta: Meta = {title: 'primitives/Composer/TriggerPopover'}
export default meta
type Story = StoryObj

const HELP: TriggerItem = {id: 'help', type: 'command', label: '/help'}
const COMMANDS: TriggerItem[] = [
  {id: 'compact', type: 'command', label: '/compact', description: 'Compact the conversation'},
  {id: 'usage', type: 'command', label: '/usage', description: 'Show token usage'},
  HELP,
]

const flatAdapter: TriggerAdapter = {
  categories: () => [],
  categoryItems: () => [],
  search: (query) => COMMANDS.filter((item) => item.id.includes(query.toLowerCase())),
}

const categorizedAdapter: TriggerAdapter = {
  categories: () => [
    {id: 'session', label: 'Session'},
    {id: 'context', label: 'Context'},
  ],
  categoryItems: (categoryId) => (categoryId === 'session' ? [HELP] : COMMANDS.slice(0, 2)),
}

const slashFormatter: DirectiveFormatter = {
  serialize: (item) => `/${item.id}`,
  parse: (text) => [{kind: 'text', text}],
}

function App(props: {
  adapter: TriggerAdapter
  onExecute?: (item: TriggerItem) => void
  removeOnExecute?: boolean
}): JSX.Element {
  const chat = useChat({connection: storyConnection()})
  return (
    <ChatProvider chat={chat}>
      <Composer.TriggerPopoverRoot>
        <Composer.Root class="flex flex-col gap-1 relative">
          <Composer.Input aria-label="Message" placeholder="Type / for commands" />
          <Composer.TriggerPopover char="/" adapter={props.adapter} class="border flex flex-col">
            {props.onExecute ? (
              <Composer.TriggerPopover.Action
                formatter={slashFormatter}
                onExecute={props.onExecute}
                removeOnExecute={props.removeOnExecute}
              />
            ) : (
              <Composer.TriggerPopover.Directive formatter={slashFormatter} />
            )}
            <Composer.TriggerPopoverCategories>
              {(categories) => (
                <For each={categories()}>
                  {(category) => (
                    <Composer.TriggerPopoverCategoryItem categoryId={category.id}>
                      {category.label}
                    </Composer.TriggerPopoverCategoryItem>
                  )}
                </For>
              )}
            </Composer.TriggerPopoverCategories>
            <Composer.TriggerPopoverItems>
              {(items) => (
                <For each={items()}>
                  {(item, index) => (
                    <Composer.TriggerPopoverItem item={item} index={index()}>
                      {item.label}
                    </Composer.TriggerPopoverItem>
                  )}
                </For>
              )}
            </Composer.TriggerPopoverItems>
            <Composer.TriggerPopoverBack>Back</Composer.TriggerPopoverBack>
          </Composer.TriggerPopover>
        </Composer.Root>
      </Composer.TriggerPopoverRoot>
    </ChatProvider>
  )
}

export const OpensAndFilters: Story = {
  render: () => <App adapter={flatAdapter} />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Message')
    await userEvent.type(input, '/us')
    await waitFor(() => expect(canvas.getByRole('option', {name: '/usage'})).toBeVisible())
    expect(canvas.queryByRole('option', {name: '/compact'})).toBeNull()
    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(input).toHaveAttribute('aria-haspopup', 'listbox')
    expect(input).toHaveAttribute('aria-controls', canvas.getByRole('listbox').id)
  },
}

export const KeyboardSelect: Story = {
  render: () => <App adapter={flatAdapter} />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Message')
    await userEvent.type(input, '/')
    await waitFor(() => expect(canvas.getByRole('option', {name: '/compact'})).toBeVisible())
    await userEvent.keyboard('{ArrowDown}{Enter}')
    await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe('/usage '))
    expect(canvas.queryByRole('listbox')).toBeNull()
    expect(input).not.toHaveAttribute('aria-expanded')
  },
}

export const TabSelects: Story = {
  render: () => <App adapter={flatAdapter} />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Message')
    await userEvent.type(input, '/')
    await waitFor(() => expect(canvas.getByRole('option', {name: '/compact'})).toBeVisible())
    await userEvent.keyboard('{Tab}')
    await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe('/compact '))
  },
}

export const HighlightCyclesWithWraparound: Story = {
  render: () => <App adapter={flatAdapter} />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Message')
    await userEvent.type(input, '/')
    await waitFor(() => expect(canvas.getByRole('option', {name: '/compact'})).toBeVisible())
    expect(canvas.getByRole('option', {name: '/compact'})).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{ArrowUp}')
    await waitFor(() => expect(canvas.getByRole('option', {name: '/help'})).toHaveAttribute('aria-selected', 'true'))
    expect(input).toHaveAttribute('aria-activedescendant', canvas.getByRole('option', {name: '/help'}).id)
    await userEvent.keyboard('{ArrowDown}')
    await waitFor(() => expect(canvas.getByRole('option', {name: '/compact'})).toHaveAttribute('aria-selected', 'true'))
  },
}

export const HoverHighlights: Story = {
  render: () => <App adapter={flatAdapter} />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Message')
    await userEvent.type(input, '/')
    await waitFor(() => expect(canvas.getByRole('option', {name: '/usage'})).toBeVisible())
    await userEvent.hover(canvas.getByRole('option', {name: '/usage'}))
    await waitFor(() => expect(canvas.getByRole('option', {name: '/usage'})).toHaveAttribute('data-highlighted'))
    expect(canvas.getByRole('option', {name: '/compact'})).not.toHaveAttribute('data-highlighted')
  },
}

export const ShiftEnterInsertsNewlineAndStaysOpen: Story = {
  render: () => <App adapter={flatAdapter} />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Message')
    await userEvent.type(input, '/co')
    await waitFor(() => expect(canvas.getByRole('listbox')).toBeVisible())
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}')
    await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe('/co\n'))
  },
}

export const EscapeCloses: Story = {
  render: () => <App adapter={flatAdapter} />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Message')
    await userEvent.type(input, '/co')
    await waitFor(() => expect(canvas.getByRole('listbox')).toBeVisible())
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(canvas.queryByRole('listbox')).toBeNull())
    expect(input).not.toHaveAttribute('aria-expanded')
    expect((input as HTMLTextAreaElement).value).toBe('/co')
  },
}

export const CursorMoveOutsideTriggerCloses: Story = {
  render: () => <App adapter={flatAdapter} />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Message')
    await userEvent.type(input, 'hi /co')
    await waitFor(() => expect(canvas.getByRole('listbox')).toBeVisible())
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}')
    await waitFor(() => expect(canvas.queryByRole('listbox')).toBeNull())
    await userEvent.keyboard('{End}')
    await waitFor(() => expect(canvas.getByRole('listbox')).toBeVisible())
  },
}

export const CategoriesDrillAndBack: Story = {
  render: () => <App adapter={categorizedAdapter} />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Message')
    await userEvent.type(input, '/')
    await waitFor(() => expect(canvas.getByRole('option', {name: 'Session'})).toBeVisible())
    await userEvent.click(canvas.getByRole('option', {name: 'Session'}))
    await waitFor(() => expect(canvas.getByRole('option', {name: '/help'})).toBeVisible())
    expect(canvas.getByRole('button', {name: 'Back'})).toBeVisible()
    input.focus()
    await userEvent.keyboard('{Backspace}')
    await waitFor(() => expect(canvas.getByRole('option', {name: 'Context'})).toBeVisible())
  },
}

export const CategoryKeyboardDrill: Story = {
  render: () => <App adapter={categorizedAdapter} />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Message')
    await userEvent.type(input, '/')
    await waitFor(() => expect(canvas.getByRole('option', {name: 'Session'})).toBeVisible())
    await userEvent.keyboard('{ArrowDown}{Enter}')
    await waitFor(() => expect(canvas.getByRole('option', {name: '/compact'})).toBeVisible())
    await userEvent.click(canvas.getByRole('button', {name: 'Back'}))
    await waitFor(() => expect(canvas.getByRole('option', {name: 'Session'})).toBeVisible())
  },
}

export const TypedQueryEntersSearchModeFromCategories: Story = {
  render: () => <App adapter={categorizedAdapter} />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Message')
    await userEvent.type(input, '/usa')
    await waitFor(() => expect(canvas.getByRole('option', {name: '/usage'})).toBeVisible())
    expect(canvas.queryByRole('option', {name: 'Session'})).toBeNull()
    expect(canvas.queryByRole('button', {name: 'Back'})).toBeNull()
  },
}

export const ActionExecutesAndRemoves: Story = {
  render: () => {
    const executed: string[] = []
    return <App adapter={flatAdapter} onExecute={(item) => executed.push(item.id)} removeOnExecute />
  },
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Message')
    await userEvent.type(input, 'hi /comp')
    await waitFor(() => expect(canvas.getByRole('option', {name: '/compact'})).toBeVisible())
    await userEvent.click(canvas.getByRole('option', {name: '/compact'}))
    await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe('hi '))
    expect(canvas.queryByRole('listbox')).toBeNull()
  },
}

export const ActionLeavesAuditChip: Story = {
  render: () => <App adapter={flatAdapter} onExecute={() => {}} />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Message')
    await userEvent.type(input, '/comp')
    await waitFor(() => expect(canvas.getByRole('option', {name: '/compact'})).toBeVisible())
    await userEvent.click(canvas.getByRole('option', {name: '/compact'}))
    await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe('/compact '))
  },
}

export const NoAdapterStaysClosed: Story = {
  render: () => {
    const chat = useChat({connection: storyConnection()})
    return (
      <ChatProvider chat={chat}>
        <Composer.TriggerPopoverRoot>
          <Composer.Root class="flex flex-col gap-1 relative">
            <Composer.Input aria-label="Message" />
            <Composer.TriggerPopover char="/">
              <Composer.TriggerPopover.Directive formatter={slashFormatter} />
            </Composer.TriggerPopover>
          </Composer.Root>
        </Composer.TriggerPopoverRoot>
      </ChatProvider>
    )
  },
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Message')
    await userEvent.type(input, '/co')
    expect(canvas.queryByRole('listbox')).toBeNull()
    expect((input as HTMLTextAreaElement).value).toBe('/co')
  },
}
