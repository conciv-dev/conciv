import {createSignal} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {createStore} from 'solid-js/store'
import {useSettingsForm} from './settings-form.js'
import {TextArea} from './text-field.js'

const meta: Meta = {title: 'ui-kit-system/TextField'}
export default meta
type Story = StoryObj

const WRAPPING_TEXT =
  'the quick brown fox jumps over the lazy dog and keeps running far beyond the edge of the visible composer area'

export const RefitsWhenWidthShrinks: Story = {
  render: () => {
    const [width, setWidth] = createSignal(600)
    return (
      <div>
        <button type="button" onClick={() => setWidth(240)}>
          narrow
        </button>
        <div style={{width: `${width()}px`}}>
          <TextArea placeholder="Ask anything…" minRows={1} maxRows={12} value={WRAPPING_TEXT} />
        </div>
      </div>
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const area = c.getByPlaceholderText('Ask anything…')
    await waitFor(() => expect(area.scrollHeight).toBeLessThanOrEqual(area.clientHeight))

    await userEvent.click(c.getByText('narrow'))

    await waitFor(() => expect(area.scrollHeight).toBeLessThanOrEqual(area.clientHeight))
  },
}

export const Autosize: Story = {
  render: () => {
    const [value, setValue] = createSignal('')
    return (
      <TextArea
        placeholder="Ask anything…"
        minRows={1}
        maxRows={5}
        value={value()}
        onInput={(event) => setValue(event.currentTarget.value)}
      />
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const area = c.getByPlaceholderText('Ask anything…')
    const before = area.clientHeight
    await userEvent.type(area, 'line one\nline two\nline three')
    await waitFor(() => expect(area.clientHeight).toBeGreaterThan(before))
  },
}

const STACK = 'flex flex-col gap-5 w-120 max-w-full'

function validateTexts({value}: {value: {name: string; bundleId: string; notes: string}}) {
  return {
    fields: {
      name: value.name.length === 0 ? 'Give the project a name.' : undefined,
      bundleId: /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/i.test(value.bundleId)
        ? undefined
        : 'Use reverse-DNS, like dev.conciv.app.',
      notes: value.notes.length > 80 ? 'Keep it under 80 characters.' : undefined,
    },
  }
}

function TextSettings() {
  const [log, setLog] = createStore({last: 'nothing yet'})
  const form = useSettingsForm(() => ({
    defaultValues: {
      name: 'checkout',
      baseUrl: 'localhost:5173/app',
      bundleId: 'conciv app',
      apiHost: 'api.internal',
      remote: '',
      notes: '',
    },
    validators: {onMount: validateTexts, onBlur: validateTexts},
    listeners: {
      onBlur: ({fieldApi}) => {
        if (fieldApi.state.meta.errors.length === 0) setLog('last', `${fieldApi.name}: ${String(fieldApi.state.value)}`)
      },
    },
  }))
  const values = form.useStore((state) => state.values)
  return (
    <div class={STACK}>
      <form.AppField name="name">
        {(field) => <field.TextField label="Project name" description="Shown in the tab title." />}
      </form.AppField>
      <form.AppField name="baseUrl">
        {(field) => (
          <field.TextField
            label="Base URL"
            addonStart="http://"
            mono
            changed={values().baseUrl !== 'localhost:5173'}
            onReset={() => form.setFieldValue('baseUrl', 'localhost:5173')}
          />
        )}
      </form.AppField>
      <form.AppField name="bundleId">{(field) => <field.TextField label="Bundle id" mono />}</form.AppField>
      <form.AppField name="apiHost">
        {(field) => <field.TextField label="API host" addonEnd=":443" mono locked="Set by CONCIV_API_HOST" />}
      </form.AppField>
      <form.AppField name="remote">
        {(field) => (
          <field.TextField
            label="Remote origin"
            placeholder="git@github.com:org/repo.git"
            description="Needs git."
            disabled
          />
        )}
      </form.AppField>
      <form.AppField name="notes">
        {(field) => (
          <field.TextAreaField
            label="Notes for the agent"
            description="Sent with every turn."
            placeholder="Prefer small commits."
            maxLength={80}
          />
        )}
      </form.AppField>
      <p class="text-[0.75rem] text-chat-text-2">Committed {log.last}</p>
    </div>
  )
}

export const SettingStates: Story = {render: () => <TextSettings />}

export const SettingKeyboard: Story = {
  render: () => <TextSettings />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const name = canvas.getByRole('textbox', {name: 'Project name'})
    await expect(name).toHaveAccessibleDescription('Shown in the tab title.')
    const bundle = canvas.getByRole('textbox', {name: 'Bundle id'})
    await expect(bundle).toHaveAccessibleDescription(/Use reverse-DNS, like dev\.conciv\.app\./)
    await expect(bundle).toHaveAttribute('aria-invalid', 'true')

    await userEvent.click(name)
    await userEvent.type(name, '-web')
    await expect(canvas.getByText('Committed nothing yet')).toBeVisible()
    await userEvent.keyboard('{Enter}')
    await expect(canvas.getByText('Committed name: checkout-web')).toBeVisible()
    await expect(name).toHaveFocus()

    await userEvent.clear(name)
    await userEvent.tab()
    await expect(canvas.getByText('Give the project a name.')).toBeVisible()
    await expect(name).toHaveAttribute('aria-invalid', 'true')
    await expect(canvas.getByText('Committed name: checkout-web')).toBeVisible()

    await userEvent.clear(bundle)
    await userEvent.type(bundle, 'dev.conciv.app')
    await userEvent.tab()
    await waitFor(() => expect(bundle).not.toHaveAttribute('aria-invalid', 'true'))
    await expect(canvas.getByText('Committed bundleId: dev.conciv.app')).toBeVisible()

    await userEvent.click(canvas.getByRole('button', {name: 'Reset to default'}))
    const baseUrl = canvas.getByRole('textbox', {name: 'Base URL'})
    await waitFor(() => expect(baseUrl).toHaveValue('localhost:5173'))
    await expect(baseUrl).toHaveFocus()
    await expect(canvas.getByText('Committed baseUrl: localhost:5173')).toBeVisible()

    await expect(canvas.getByRole('textbox', {name: 'API host'})).toHaveAttribute('readonly')
    await expect(canvas.getByRole('textbox', {name: 'Remote origin'})).toBeDisabled()

    const notes = canvas.getByRole('textbox', {name: 'Notes for the agent'})
    await userEvent.type(notes, 'Run the tests before every commit, and keep each commit small and focused please.')
    await expect(canvas.getByText('81 / 80')).toBeVisible()
    await userEvent.tab()
    await expect(canvas.getByText('Keep it under 80 characters.')).toBeVisible()
  },
}
