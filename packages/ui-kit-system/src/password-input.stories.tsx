import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {createStore} from 'solid-js/store'
import {useSettingsForm} from './settings-form.js'

const meta: Meta = {title: 'ui-kit-system/PasswordInput'}
export default meta
type Story = StoryObj

const STACK = 'flex flex-col gap-5 w-120 max-w-full'

function validateSecrets({value}: {value: {openai: string}}) {
  return {fields: {openai: value.openai.startsWith('sk-') ? undefined : 'OpenAI keys start with sk-.'}}
}

function SecretSettings() {
  const [log, setLog] = createStore({last: 'nothing yet'})
  const form = useSettingsForm(() => ({
    defaultValues: {figma: 'figd_0000', github: 'ghp_1234', openai: 'pk-live', sentry: 'sntrys_99', cloud: ''},
    validators: {onMount: validateSecrets, onBlur: validateSecrets},
    listeners: {
      onBlur: ({fieldApi}) => {
        if (fieldApi.state.meta.errors.length === 0) setLog('last', `${fieldApi.name} saved`)
      },
    },
  }))
  const values = form.useStore((state) => state.values)
  return (
    <div class={STACK}>
      <form.AppField name="figma">
        {(field) => <field.PasswordField label="Figma token" description="Stored in your keychain." copyable />}
      </form.AppField>
      <form.AppField name="github">
        {(field) => (
          <field.PasswordField
            label="GitHub token"
            changed={values().github !== ''}
            onReset={() => form.setFieldValue('github', '')}
          />
        )}
      </form.AppField>
      <form.AppField name="openai">{(field) => <field.PasswordField label="OpenAI key" />}</form.AppField>
      <form.AppField name="sentry">
        {(field) => <field.PasswordField label="Sentry token" locked="Set by SENTRY_AUTH_TOKEN" />}
      </form.AppField>
      <form.AppField name="cloud">
        {(field) => <field.PasswordField label="Cloud key" description="Needs a cloud project." disabled />}
      </form.AppField>
      <p class="text-[0.75rem] text-chat-text-2">Committed {log.last}</p>
    </div>
  )
}

export const SettingStates: Story = {render: () => <SecretSettings />}

export const SettingKeyboard: Story = {
  render: () => <SecretSettings />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const figma = canvas.getByLabelText('Figma token')
    await expect(figma).toHaveAttribute('type', 'password')
    await expect(figma).toHaveAccessibleDescription('Stored in your keychain.')
    await expect(canvas.getByLabelText('OpenAI key')).toHaveAccessibleDescription(/OpenAI keys start with sk-\./)

    const reveal = canvas.getAllByRole('button', {name: 'Show secret'})[0]
    if (!reveal) throw new Error('the secret field renders no reveal button')
    await userEvent.click(reveal)
    await waitFor(() => expect(figma).toHaveAttribute('type', 'text'))
    await expect(canvas.getAllByRole('button', {name: 'Hide secret'})[0]).toBeVisible()
    await expect(figma).toHaveFocus()

    await userEvent.type(figma, '1{Enter}')
    await expect(canvas.getByText('Committed figma saved')).toBeVisible()
    await expect(figma).toHaveValue('figd_00001')

    await userEvent.click(canvas.getByRole('button', {name: 'Reset to default'}))
    const github = canvas.getByLabelText('GitHub token')
    await waitFor(() => expect(github).toHaveValue(''))
    await expect(github).toHaveFocus()
    await expect(canvas.getByText('Committed github saved')).toBeVisible()

    await expect(canvas.getByLabelText('Sentry token')).toHaveAttribute('readonly')
    await expect(canvas.getByLabelText('Cloud key')).toBeDisabled()
  },
}
