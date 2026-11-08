import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {createStore} from 'solid-js/store'
import {Checkbox} from './checkbox.js'
import {CheckboxGroup} from './checkbox-group.js'
import {FieldShell} from './field-shell.js'

const meta: Meta = {title: 'ui-kit-system/Checkbox'}
export default meta
type Story = StoryObj

const STACK = 'flex flex-col gap-5 w-120 max-w-full'
const NOTE = 'text-[0.75rem] text-chat-text-2'
const DAYS = [
  {value: 'mon', label: 'Monday'},
  {value: 'tue', label: 'Tuesday'},
  {value: 'wed', label: 'Wednesday'},
  {value: 'thu', label: 'Thursday'},
]

export const Default: Story = {
  render: () => {
    const [state, setState] = createStore({checked: false})
    return (
      <div class="flex flex-col gap-2">
        <Checkbox
          label="Remember me"
          checked={state.checked}
          onCheckedChange={(checked) => setState('checked', checked)}
        />
        <Checkbox label="Keep a copy" disabled />
        <Checkbox label="Accept the terms" invalid />
        <Checkbox label="Archived" checked readOnly />
        <span class={NOTE}>Remember me: {state.checked ? 'yes' : 'no'}</span>
      </div>
    )
  },
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const remember = canvas.getByRole('checkbox', {name: 'Remember me'})
    await userEvent.click(canvas.getByText('Remember me'))
    await waitFor(() => expect(remember).toBeChecked())
    await expect(canvas.getByText('Remember me: yes')).toBeVisible()
    await userEvent.keyboard(' ')
    await waitFor(() => expect(remember).not.toBeChecked())
    await expect(canvas.getByRole('checkbox', {name: 'Keep a copy'})).toBeDisabled()
    await userEvent.click(canvas.getByText('Archived'))
    await expect(canvas.getByRole('checkbox', {name: 'Archived'})).toBeChecked()
  },
}

function DayGroups() {
  const [state, setState] = createStore<{open: string[]; delivery: string[]}>({open: ['mon', 'tue'], delivery: []})
  const deliveryError = () => (state.delivery.length === 0 ? 'Pick at least one day.' : undefined)
  return (
    <div class={STACK}>
      <FieldShell label="Open days" description="Days the store is open." group>
        <CheckboxGroup options={DAYS} value={state.open} onValueChange={(value) => setState('open', value)} />
      </FieldShell>
      <FieldShell label="Delivery days" group error={deliveryError()}>
        <CheckboxGroup
          options={DAYS}
          value={state.delivery}
          invalid={deliveryError() !== undefined}
          onValueChange={(value) => setState('delivery', value)}
        />
      </FieldShell>
      <FieldShell label="Holidays" group>
        <CheckboxGroup options={DAYS} value={['mon']} readOnly />
      </FieldShell>
      <FieldShell label="Late hours" description="Needs an evening shift first." group disabled>
        <CheckboxGroup options={DAYS} value={['wed']} disabled />
      </FieldShell>
      <p class={NOTE}>Open {state.open.join(', ')}</p>
    </div>
  )
}

export const GroupStates: Story = {render: () => <DayGroups />}

export const GroupKeyboard: Story = {
  render: () => <DayGroups />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const open = within(canvas.getByRole('group', {name: 'Open days'}))
    await expect(canvas.getByRole('group', {name: 'Open days'})).toHaveAccessibleDescription('Days the store is open.')
    await expect(canvas.getByRole('group', {name: 'Delivery days'})).toHaveAccessibleDescription(
      /Pick at least one day\./,
    )

    await userEvent.click(open.getByText('Wednesday'))
    await waitFor(() => expect(open.getByRole('checkbox', {name: 'Wednesday'})).toBeChecked())
    await expect(canvas.getByText('Open mon, tue, wed')).toBeVisible()
    await userEvent.tab()
    await expect(open.getByRole('checkbox', {name: 'Thursday'})).toHaveFocus()
    await userEvent.keyboard(' ')
    await waitFor(() => expect(open.getByRole('checkbox', {name: 'Thursday'})).toBeChecked())
    await expect(canvas.getByText('Open mon, tue, wed, thu')).toBeVisible()

    const delivery = within(canvas.getByRole('group', {name: 'Delivery days'}))
    await userEvent.tab()
    await expect(delivery.getByRole('checkbox', {name: 'Monday'})).toHaveFocus()
    await userEvent.keyboard(' ')
    await waitFor(() => expect(delivery.getByRole('checkbox', {name: 'Monday'})).toBeChecked())
    await expect(canvas.queryByText('Pick at least one day.')).toBeNull()

    const holidays = within(canvas.getByRole('group', {name: 'Holidays'}))
    await userEvent.click(holidays.getByText('Tuesday'))
    await expect(holidays.getByRole('checkbox', {name: 'Tuesday'})).not.toBeChecked()
    await expect(
      within(canvas.getByRole('group', {name: 'Late hours'})).getByRole('checkbox', {name: 'Monday'}),
    ).toBeDisabled()
  },
}
