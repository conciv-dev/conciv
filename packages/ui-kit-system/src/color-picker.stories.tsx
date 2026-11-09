import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {createStore} from 'solid-js/store'
import {ColorPicker} from './color-picker.js'
import {FieldShell} from './field-shell.js'

const meta: Meta = {title: 'ui-kit-system/ColorPicker'}
export default meta
type Story = StoryObj

const STACK = 'flex flex-col gap-5 w-120 max-w-full'
const NOTE = 'text-[0.75rem] text-chat-text-2'
const PRESETS = ['#7c5cff', '#2f80ed', '#27ae60', '#f2994a', '#eb5757']

function ColorStates() {
  const [state, setState] = createStore({background: '#7c5cff', text: '#ffffff', committed: 'nothing yet'})
  const textError = () =>
    state.text.toLowerCase() === '#ffffff' ? 'White text disappears on light backgrounds.' : undefined
  return (
    <div class={STACK}>
      <FieldShell label="Background" description="Fills the card behind the text.">
        <ColorPicker
          value={state.background}
          presets={PRESETS}
          onValueChange={(value) => setState('background', value)}
          onValueCommit={(value) => setState('committed', value)}
        />
      </FieldShell>
      <FieldShell label="Text color" error={textError()}>
        <ColorPicker value={state.text} onValueChange={(value) => setState('text', value)} />
      </FieldShell>
      <FieldShell label="Brand color" readOnly>
        <ColorPicker value="#2f80ed" />
      </FieldShell>
      <FieldShell label="Border color" description="Turn on borders first." disabled>
        <ColorPicker value="#27ae60" />
      </FieldShell>
      <p class={NOTE}>Committed {state.committed}</p>
    </div>
  )
}

export const States: Story = {render: () => <ColorStates />}

export const Keyboard: Story = {
  render: () => <ColorStates />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const background = canvas.getByRole('textbox', {name: 'Background'})
    await expect(background).toHaveValue('#7C5CFF')
    await expect(background).toHaveAccessibleDescription('Fills the card behind the text.')
    const text = canvas.getByRole('textbox', {name: 'Text color'})
    await expect(text).toHaveAccessibleDescription(/White text disappears on light backgrounds\./)

    await userEvent.clear(background)
    await userEvent.type(background, '#112233{Enter}')
    await expect(canvas.getByText('Committed #112233')).toBeVisible()
    await expect(background).toHaveFocus()

    const [green] = canvas.getAllByRole('button', {name: 'select #27AE60 as the color'})
    if (!green) throw new Error('the background picker renders no green preset')
    await userEvent.click(green)
    await waitFor(() => expect(background).toHaveValue('#27AE60'))
    await expect(canvas.getByText('Committed #27AE60')).toBeVisible()

    await userEvent.clear(text)
    await userEvent.type(text, '#222222{Enter}')
    await expect(canvas.queryByText('White text disappears on light backgrounds.')).toBeNull()

    await expect(canvas.getByRole('textbox', {name: 'Brand color'})).toHaveAttribute('readonly')
    await expect(canvas.getByRole('textbox', {name: 'Border color'})).toBeDisabled()
  },
}
