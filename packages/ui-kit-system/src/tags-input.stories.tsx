import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {createStore} from 'solid-js/store'
import {FieldShell} from './field-shell.js'
import {TagsInput} from './tags-input.js'

const meta: Meta = {title: 'ui-kit-system/TagsInput'}
export default meta
type Story = StoryObj

const STACK = 'flex flex-col gap-5 w-120 max-w-full'
const NOTE = 'text-[0.75rem] text-chat-text-2'

function TagStates() {
  const [state, setState] = createStore<{topics: string[]; recipients: string[]}>({
    topics: ['design'],
    recipients: ['ana@example.com', 'bo@example.com', 'cy@example.com'],
  })
  const recipientsError = () => (state.recipients.length > 2 ? 'At most 2 recipients.' : undefined)
  return (
    <div class={STACK}>
      <FieldShell label="Topics" description="Press Enter or comma to add one.">
        <TagsInput
          value={state.topics}
          placeholder="Add a topic"
          onValueChange={(value) => setState('topics', value)}
        />
      </FieldShell>
      <FieldShell label="Recipients" error={recipientsError()}>
        <TagsInput value={state.recipients} onValueChange={(value) => setState('recipients', value)} />
      </FieldShell>
      <FieldShell label="Categories" readOnly>
        <TagsInput value={['books', 'music']} />
      </FieldShell>
      <FieldShell label="Keywords" description="Publish the page first." disabled>
        <TagsInput value={['draft']} />
      </FieldShell>
      <p class={NOTE}>Topics {state.topics.join(', ')}</p>
    </div>
  )
}

export const States: Story = {render: () => <TagStates />}

export const Keyboard: Story = {
  render: () => <TagStates />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const topics = canvas.getByRole('textbox', {name: 'Topics'})
    await expect(topics).toHaveAccessibleDescription('Press Enter or comma to add one.')
    await expect(canvas.getByRole('textbox', {name: 'Recipients'})).toHaveAccessibleDescription(
      /At most 2 recipients\./,
    )

    await userEvent.click(topics)
    await userEvent.type(topics, 'travel{Enter}')
    await expect(canvas.getByText('travel')).toBeVisible()
    await expect(canvas.getByText('Topics design, travel')).toBeVisible()
    await userEvent.type(topics, 'food,')
    await expect(canvas.getByText('Topics design, travel, food')).toBeVisible()
    await expect(topics).toHaveFocus()

    await userEvent.keyboard('{Backspace}')
    await userEvent.keyboard('{Backspace}')
    await waitFor(() => expect(canvas.queryByText('food')).toBeNull())
    await expect(canvas.getByText('Topics design, travel')).toBeVisible()

    await userEvent.click(canvas.getByRole('button', {name: 'Remove cy@example.com'}))
    await waitFor(() => expect(canvas.queryByText('cy@example.com')).toBeNull())
    await expect(canvas.queryByText('At most 2 recipients.')).toBeNull()

    await expect(canvas.queryByRole('button', {name: 'Remove books'})).toBeNull()
    await expect(canvas.getByRole('textbox', {name: 'Categories'})).toBeDisabled()
    await expect(canvas.getByRole('textbox', {name: 'Keywords'})).toBeDisabled()
  },
}
