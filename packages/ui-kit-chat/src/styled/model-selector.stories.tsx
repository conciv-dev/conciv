import {createSignal, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {ModelSelector} from './model-selector.js'
import type {ModelOption} from '../primitives/model-selector/model-selector.js'

const meta: Meta = {title: 'ui-kit-chat/styled/ModelSelector'}
export default meta
type Story = StoryObj

const MODELS: ModelOption[] = [
  {id: 'claude-opus-4-8', name: 'Claude Opus 4.8', description: 'Most capable', efforts: true},
  {id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', description: 'Balanced speed and depth'},
  {id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', description: 'Fastest', keywords: ['cheap', 'small']},
  {id: 'gpt-5', name: 'GPT-5', description: 'Unavailable on this harness', disabled: true},
]

function Demo(): JSX.Element {
  const [value, setValue] = createSignal('claude-opus-4-8')
  const [effort, setEffort] = createSignal('medium')
  return (
    <div class="p-10 [background:var(--chat-bg)] [font-family:var(--chat-font)]">
      <ModelSelector
        models={MODELS}
        value={value()}
        onValueChange={setValue}
        effort={effort()}
        onEffortChange={setEffort}
        searchable
      />
    </div>
  )
}

function build(): Story {
  return {
    render: () => <Demo />,
    play: async ({canvasElement}) => {
      const canvas = within(canvasElement)
      const trigger = canvas.getByRole('button', {name: 'Select model'})
      await expect(trigger).toHaveTextContent('Claude Opus 4.8')
      await userEvent.click(trigger)
      const search = await waitFor(() => {
        expect(trigger).toHaveAttribute('aria-expanded', 'true')
        const field = canvas.getByPlaceholderText('Search models…')
        expect(field).toHaveFocus()
        return field
      })
      await expect(search).toBeVisible()

      await expect(canvas.getByRole('group', {name: 'Reasoning effort'})).toBeVisible()

      await userEvent.type(search, 'haiku')
      await waitFor(() => expect(canvas.queryByText('Claude Sonnet 4.6')).toBeNull())
      await expect(canvas.getByText('Claude Haiku 4.5')).toBeVisible()

      await userEvent.click(canvas.getByText('Claude Haiku 4.5'))
      await waitFor(() => expect(trigger).toHaveTextContent('Claude Haiku 4.5'))

      await expect(trigger).not.toHaveTextContent('Medium')
    },
  }
}

export const Neutral: Story = build()
