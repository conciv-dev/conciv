import {createSignal, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {ModelSelector, type ModelOption} from './model-selector.js'

const meta: Meta = {title: 'primitives/ModelSelector'}
export default meta
type Story = StoryObj

const MODELS: ModelOption[] = [
  {id: 'a', name: 'Alpha'},
  {id: 'b', name: 'Beta'},
  {id: 'c', name: 'Gamma', disabled: true},
]

// Unstyled: the only CSS is the open/closed toggle Ark drives via data-state, so the play test can
// see the content. List with no children auto-renders the filtered items.
export const Headless: Story = {
  render: (): JSX.Element => {
    const [value, setValue] = createSignal('a')
    return (
      <div style={{padding: '4rem'}}>
        <ModelSelector.Root models={MODELS} value={value()} onValueChange={setValue}>
          <ModelSelector.Trigger />
          <ModelSelector.Content class="hidden data-[state=open]:block">
            <ModelSelector.Search />
            <ModelSelector.Empty />
            <ModelSelector.List />
          </ModelSelector.Content>
        </ModelSelector.Root>
      </div>
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const trigger = c.getByRole('button', {name: 'Select model'})
    await expect(trigger).toHaveTextContent('Alpha')
    await userEvent.click(trigger)
    const search = await waitFor(() => c.getByPlaceholderText('Search models…'))
    await userEvent.type(search, 'bet')
    await waitFor(() => expect(c.queryByText('Alpha')).toBeNull())
    await userEvent.click(c.getByText('Beta'))
    await waitFor(() => expect(trigger).toHaveTextContent('Beta'))
  },
}
