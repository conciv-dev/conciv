import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {createStore} from 'solid-js/store'
import {useSettingsForm} from './settings-form.js'

const meta: Meta = {title: 'ui-kit-system/TagsInput'}
export default meta
type Story = StoryObj

const STACK = 'flex flex-col gap-5 w-120 max-w-full'

function validateTags({value}: {value: {hosts: string[]}}) {
  return {fields: {hosts: value.hosts.length > 2 ? 'At most 2 hosts.' : undefined}}
}

function TagSettings() {
  const [log, setLog] = createStore({last: 'nothing yet'})
  const form = useSettingsForm(() => ({
    defaultValues: {
      ignore: ['.ad-banner'],
      mask: ['input[type=email]', '.card-number'],
      hosts: ['localhost', 'staging.app', 'prod.app'],
      origins: ['https://conciv.dev'],
      labels: ['beta'],
    },
    validators: {onMount: validateTags, onBlur: validateTags},
    listeners: {
      onBlur: ({fieldApi}) => {
        if (fieldApi.state.meta.errors.length === 0) setLog('last', `${fieldApi.name}: ${String(fieldApi.state.value)}`)
      },
    },
  }))
  const values = form.useStore((state) => state.values)
  return (
    <div class={STACK}>
      <form.AppField name="ignore">
        {(field) => (
          <field.TagsField
            label="Ignore selectors"
            description="Press Enter or comma to add one."
            placeholder="Add a selector"
          />
        )}
      </form.AppField>
      <form.AppField name="mask">
        {(field) => (
          <field.TagsField
            label="Mask selectors"
            changed={values().mask.length !== 1}
            onReset={() => form.setFieldValue('mask', ['input[type=password]'])}
          />
        )}
      </form.AppField>
      <form.AppField name="hosts">{(field) => <field.TagsField label="Allowed hosts" />}</form.AppField>
      <form.AppField name="origins">
        {(field) => <field.TagsField label="Allowed origins" locked="Set in conciv.config.ts" />}
      </form.AppField>
      <form.AppField name="labels">
        {(field) => <field.TagsField label="Issue labels" description="Needs a linked tracker." disabled />}
      </form.AppField>
      <p class="text-[0.75rem] text-chat-text-2">Committed {log.last}</p>
    </div>
  )
}

export const SettingStates: Story = {render: () => <TagSettings />}

export const SettingKeyboard: Story = {
  render: () => <TagSettings />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const ignore = canvas.getByRole('textbox', {name: 'Ignore selectors'})
    await expect(ignore).toHaveAccessibleDescription('Press Enter or comma to add one.')
    await expect(canvas.getByRole('textbox', {name: 'Allowed hosts'})).toHaveAccessibleDescription(/At most 2 hosts\./)

    await userEvent.click(ignore)
    await userEvent.type(ignore, '#cookie-bar{Enter}')
    await expect(canvas.getByText('#cookie-bar')).toBeVisible()
    await expect(canvas.getByText('Committed ignore: .ad-banner,#cookie-bar')).toBeVisible()
    await userEvent.type(ignore, '.promo,')
    await expect(canvas.getByText('.promo')).toBeVisible()
    await expect(ignore).toHaveFocus()

    await userEvent.keyboard('{Backspace}')
    await userEvent.keyboard('{Backspace}')
    await waitFor(() => expect(canvas.queryByText('.promo')).toBeNull())
    await expect(canvas.getByText('Committed ignore: .ad-banner,#cookie-bar')).toBeVisible()

    await userEvent.click(canvas.getByRole('button', {name: 'Remove #cookie-bar'}))
    await waitFor(() => expect(canvas.queryByText('#cookie-bar')).toBeNull())
    await expect(canvas.getByText('Committed ignore: .ad-banner')).toBeVisible()

    await userEvent.click(canvas.getByRole('button', {name: 'Reset to default'}))
    await expect(canvas.getByText('input[type=password]')).toBeVisible()
    await expect(canvas.getByRole('textbox', {name: 'Mask selectors'})).toHaveFocus()
    await expect(canvas.getByText('Committed mask: input[type=password]')).toBeVisible()

    await expect(canvas.queryByRole('button', {name: 'Remove https://conciv.dev'})).toBeNull()
    await expect(canvas.getByRole('textbox', {name: 'Issue labels'})).toBeDisabled()
  },
}
