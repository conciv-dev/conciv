import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {createStore} from 'solid-js/store'
import {FieldShell} from './field-shell.js'
import {PasswordInput} from './password-input.js'

const meta: Meta = {title: 'ui-kit-system/PasswordInput'}
export default meta
type Story = StoryObj

const STACK = 'flex flex-col gap-5 w-120 max-w-full'

function PasswordStates() {
  const [state, setState] = createStore({apiKey: 'key_0000', token: 'pk-live'})
  const tokenError = () => (state.token.startsWith('tok_') ? undefined : 'Tokens start with tok_.')
  return (
    <div class={STACK}>
      <FieldShell label="API key" description="Paste the key from your provider.">
        <PasswordInput value={state.apiKey} copyable onValueChange={(value) => setState('apiKey', value)} />
      </FieldShell>
      <FieldShell label="Access token" error={tokenError()}>
        <PasswordInput value={state.token} onValueChange={(value) => setState('token', value)} />
      </FieldShell>
      <FieldShell label="Webhook secret" readOnly>
        <PasswordInput value="whsec_1234" copyable />
      </FieldShell>
      <FieldShell label="Backup key" description="Turn on backups first." disabled>
        <PasswordInput value="" placeholder="Not set" />
      </FieldShell>
    </div>
  )
}

export const States: Story = {render: () => <PasswordStates />}

export const Keyboard: Story = {
  render: () => <PasswordStates />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const apiKey = canvas.getByLabelText('API key')
    await expect(apiKey).toHaveAttribute('type', 'password')
    await expect(apiKey).toHaveAccessibleDescription('Paste the key from your provider.')
    const token = canvas.getByLabelText('Access token')
    await expect(token).toHaveAccessibleDescription(/Tokens start with tok_\./)
    await expect(token).toHaveAttribute('aria-invalid', 'true')

    const [reveal] = canvas.getAllByRole('button', {name: 'Show secret'})
    if (!reveal) throw new Error('the password input renders no reveal button')
    await userEvent.click(reveal)
    await waitFor(() => expect(apiKey).toHaveAttribute('type', 'text'))
    await expect(canvas.getAllByRole('button', {name: 'Hide secret'})[0]).toBeVisible()
    await expect(apiKey).toHaveFocus()
    await userEvent.type(apiKey, '1')
    await expect(apiKey).toHaveValue('key_00001')

    await userEvent.clear(token)
    await userEvent.type(token, 'tok_abc')
    await waitFor(() => expect(token).not.toHaveAttribute('aria-invalid', 'true'))
    await expect(canvas.queryByText('Tokens start with tok_.')).toBeNull()

    await expect(canvas.getByLabelText('Webhook secret')).toHaveAttribute('readonly')
    await expect(canvas.getByLabelText('Backup key')).toBeDisabled()
  },
}
