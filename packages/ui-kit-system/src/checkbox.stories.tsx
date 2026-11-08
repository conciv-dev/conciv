import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {createStore} from 'solid-js/store'
import {Checkbox} from './checkbox.js'
import {useSettingsForm} from './settings-form.js'

const meta: Meta = {title: 'ui-kit-system/Checkbox'}
export default meta
type Story = StoryObj

const STACK = 'flex flex-col gap-5 w-120 max-w-full'
const EVENTS = [
  {value: 'clicks', label: 'Clicks'},
  {value: 'inputs', label: 'Inputs'},
  {value: 'scroll', label: 'Scroll'},
  {value: 'network', label: 'Network'},
]

export const Default: Story = {
  render: () => {
    const [state, setState] = createStore({checked: false})
    return (
      <div class="flex flex-col gap-2">
        <Checkbox
          label="Open the panel on start"
          checked={state.checked}
          onCheckedChange={(checked) => setState('checked', checked)}
        />
        <Checkbox label="Sync across devices" disabled />
        <Checkbox label="Accept the license" invalid />
        <span class="text-[0.75rem] text-chat-text-2">Open on start: {state.checked ? 'yes' : 'no'}</span>
      </div>
    )
  },
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const open = canvas.getByRole('checkbox', {name: 'Open the panel on start'})
    await userEvent.click(canvas.getByText('Open the panel on start'))
    await waitFor(() => expect(open).toBeChecked())
    await expect(canvas.getByText('Open on start: yes')).toBeVisible()
    await userEvent.keyboard(' ')
    await waitFor(() => expect(open).not.toBeChecked())
    await expect(canvas.getByRole('checkbox', {name: 'Sync across devices'})).toBeDisabled()
  },
}

function validateGroups({value}: {value: {capture: string[]; upload: string[]}}) {
  return {
    fields: {
      capture: value.capture.length === 0 ? 'Pick at least one event.' : undefined,
      upload: value.upload.length === 0 ? 'Pick at least one event.' : undefined,
    },
  }
}

const GROUP_DEFAULTS: {capture: string[]; mask: string[]; upload: string[]; pinned: string[]; cloud: string[]} = {
  capture: ['clicks', 'inputs'],
  mask: ['inputs', 'network'],
  upload: [],
  pinned: ['clicks'],
  cloud: ['clicks'],
}

function CheckboxGroupSettings() {
  const [log, setLog] = createStore({last: 'nothing yet'})
  const form = useSettingsForm(() => ({
    defaultValues: GROUP_DEFAULTS,
    validators: {onMount: validateGroups, onBlur: validateGroups},
    listeners: {
      onBlur: ({fieldApi}) => {
        if (fieldApi.state.meta.errors.length === 0) setLog('last', `${fieldApi.name}: ${String(fieldApi.state.value)}`)
      },
    },
  }))
  const values = form.useStore((state) => state.values)
  return (
    <div class={STACK}>
      <form.AppField name="capture">
        {(field) => (
          <field.CheckboxGroupField label="Capture" description="What each replay records." options={EVENTS} />
        )}
      </form.AppField>
      <form.AppField name="mask">
        {(field) => (
          <field.CheckboxGroupField
            label="Mask"
            options={EVENTS}
            changed={values().mask.join() !== 'inputs'}
            onReset={() => form.setFieldValue('mask', ['inputs'])}
          />
        )}
      </form.AppField>
      <form.AppField name="upload">
        {(field) => <field.CheckboxGroupField label="Upload" options={EVENTS} />}
      </form.AppField>
      <form.AppField name="pinned">
        {(field) => (
          <field.CheckboxGroupField label="Always record" options={EVENTS} locked="Set by your organization" />
        )}
      </form.AppField>
      <form.AppField name="cloud">
        {(field) => (
          <field.CheckboxGroupField label="Cloud sync" description="Needs a cloud project." options={EVENTS} disabled />
        )}
      </form.AppField>
      <p class="text-[0.75rem] text-chat-text-2">Committed {log.last}</p>
    </div>
  )
}

export const GroupSettingStates: Story = {render: () => <CheckboxGroupSettings />}

export const GroupSettingKeyboard: Story = {
  render: () => <CheckboxGroupSettings />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const capture = within(canvas.getByRole('group', {name: 'Capture'}))
    await expect(canvas.getByRole('group', {name: 'Capture'})).toHaveAccessibleDescription('What each replay records.')
    await expect(canvas.getByRole('group', {name: 'Upload'})).toHaveAccessibleDescription(/Pick at least one event\./)

    await userEvent.click(capture.getByText('Scroll'))
    await waitFor(() => expect(capture.getByRole('checkbox', {name: 'Scroll'})).toBeChecked())
    await expect(canvas.getByText('Committed capture: clicks,inputs,scroll')).toBeVisible()
    await userEvent.tab()
    await expect(capture.getByRole('checkbox', {name: 'Network'})).toHaveFocus()
    await userEvent.keyboard(' ')
    await waitFor(() => expect(capture.getByRole('checkbox', {name: 'Network'})).toBeChecked())
    await expect(canvas.getByText('Committed capture: clicks,inputs,scroll,network')).toBeVisible()

    await userEvent.click(canvas.getByRole('button', {name: 'Reset to default'}))
    const mask = within(canvas.getByRole('group', {name: 'Mask'}))
    await waitFor(() => expect(mask.getByRole('checkbox', {name: 'Network'})).not.toBeChecked())
    await expect(mask.getByRole('checkbox', {name: 'Clicks'})).toHaveFocus()
    await expect(canvas.getByText('Committed mask: inputs')).toBeVisible()

    const pinned = within(canvas.getByRole('group', {name: 'Always record'}))
    await userEvent.click(pinned.getByText('Scroll'))
    await expect(pinned.getByRole('checkbox', {name: 'Scroll'})).not.toBeChecked()
    await expect(
      within(canvas.getByRole('group', {name: 'Cloud sync'})).getByRole('checkbox', {name: 'Clicks'}),
    ).toBeDisabled()
  },
}
