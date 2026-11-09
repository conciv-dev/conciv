import {createSignal} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {createStore} from 'solid-js/store'
import {FieldShell} from './field-shell.js'
import {Switch} from './switch.js'

const meta: Meta = {title: 'ui-kit-system/Switch'}
export default meta
type Story = StoryObj

export const Default: Story = {
  render: () => {
    const [on, setOn] = createSignal(false)
    return (
      <div>
        <Switch.Root checked={on()} onCheckedChange={(details) => setOn(details.checked)}>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Switch.Label>Auto-scroll</Switch.Label>
          <Switch.HiddenInput />
        </Switch.Root>
        <div>State: {on() ? 'on' : 'off'}</div>
      </div>
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const toggle = c.getByRole('switch', {name: 'Auto-scroll'})
    const control = canvasElement.querySelector('[data-part="control"]')
    if (!(control instanceof HTMLElement)) throw new Error('the switch renders no control')
    const box = control.getBoundingClientRect()
    const y = box.top + box.height / 2
    const drag = (options: {from: number; to: number}) =>
      userEvent.pointer([
        {keys: '[MouseLeft>]', target: control, coords: {clientX: box.left + options.from, clientY: y}},
        {target: control, coords: {clientX: box.left + (options.from + options.to) / 2, clientY: y}},
        {target: control, coords: {clientX: box.left + options.to, clientY: y}},
        {keys: '[/MouseLeft]', target: control},
      ])
    await expect(c.getByText('State: off')).toBeVisible()
    await expect(toggle).not.toBeChecked()

    await userEvent.click(c.getByText('Auto-scroll'))
    await waitFor(() => expect(c.getByText('State: on')).toBeVisible())
    await expect(toggle).toBeChecked()

    await userEvent.click(control)
    await waitFor(() => expect(toggle).not.toBeChecked())

    await drag({from: 8, to: box.width - 2})
    await waitFor(() => expect(toggle).toBeChecked())
    await expect(c.getByText('State: on')).toBeVisible()

    await drag({from: box.width - 8, to: box.width - 13})
    await expect(toggle).toBeChecked()
    await expect(c.getByText('State: on')).toBeVisible()

    await userEvent.pointer([
      {keys: '[MouseLeft>]', target: control, coords: {clientX: box.left + box.width - 8, clientY: y}},
      {target: control, coords: {clientX: box.left + 3, clientY: y}},
      {keys: '[/MouseLeft]', target: control},
    ])
    await waitFor(() => expect(toggle).not.toBeChecked())
    await expect(c.getByText('State: off')).toBeVisible()
  },
}

const STACK = 'flex flex-col gap-5 w-120 max-w-full'

function Toggle(props: {checked: boolean; onCheckedChange?: (checked: boolean) => void}) {
  return (
    <Switch.Root checked={props.checked} onCheckedChange={(details) => props.onCheckedChange?.(details.checked)}>
      <Switch.Control>
        <Switch.Thumb />
      </Switch.Control>
      <Switch.HiddenInput />
    </Switch.Root>
  )
}

function SwitchStates() {
  const [state, setState] = createStore({email: true, terms: false})
  return (
    <div class={STACK}>
      <FieldShell label="Email notifications" description="A message when someone replies." layout="row">
        <Toggle checked={state.email} onCheckedChange={(checked) => setState('email', checked)} />
      </FieldShell>
      <FieldShell
        label="Accept the terms"
        layout="row"
        error={state.terms ? undefined : 'Accept the terms to continue.'}
      >
        <Toggle checked={state.terms} onCheckedChange={(checked) => setState('terms', checked)} />
      </FieldShell>
      <FieldShell label="Archived" layout="row" readOnly>
        <Toggle checked />
      </FieldShell>
      <FieldShell label="Sync contacts" description="Connect an account first." layout="row" disabled>
        <Toggle checked={false} />
      </FieldShell>
    </div>
  )
}

export const States: Story = {render: () => <SwitchStates />}

export const Keyboard: Story = {
  render: () => <SwitchStates />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const email = canvas.getByRole('switch', {name: 'Email notifications'})
    await expect(email).toHaveAccessibleDescription('A message when someone replies.')
    const terms = canvas.getByRole('switch', {name: 'Accept the terms'})
    await expect(terms).toHaveAccessibleDescription(/Accept the terms to continue\./)
    await expect(canvas.getByRole('switch', {name: 'Sync contacts'})).toBeDisabled()

    await userEvent.tab()
    await expect(email).toHaveFocus()
    await expect(email.matches(':focus-visible')).toBe(true)
    await userEvent.keyboard(' ')
    await waitFor(() => expect(email).not.toBeChecked())

    await userEvent.tab()
    await expect(terms).toHaveFocus()
    await userEvent.keyboard(' ')
    await waitFor(() => expect(terms).toBeChecked())
    await expect(canvas.queryByText('Accept the terms to continue.')).toBeNull()

    const archived = canvas.getByRole('switch', {name: 'Archived'})
    await userEvent.click(canvas.getByText('Archived'))
    await expect(archived).toBeChecked()
  },
}
