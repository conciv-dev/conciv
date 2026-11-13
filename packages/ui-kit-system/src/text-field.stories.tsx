import {createSignal, Show} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {createStore} from 'solid-js/store'
import {ClipboardCopyButton} from './clipboard-copy-button.js'
import {FieldShell} from './field-shell.js'
import {TextArea, TextField} from './text-field.js'

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
const COUNTER = 'self-end pt-1 font-chat-mono text-[0.6875rem] text-chat-text-3 tabular-nums'
const NOTE_LIMIT = 80
const COUNT_FORMAT = new Intl.NumberFormat()

function TextStates() {
  const [state, setState] = createStore({
    name: 'Ada Lovelace',
    website: 'example.com',
    username: 'ada lovelace',
    bio: '',
  })
  const nameError = () => (state.name.trim() === '' ? 'Enter your name.' : undefined)
  const usernameError = () =>
    /^[a-z0-9_]+$/.test(state.username) ? undefined : 'Use lowercase letters, digits and underscores.'
  const bioError = () => (state.bio.length > NOTE_LIMIT ? `Keep it under ${NOTE_LIMIT} characters.` : undefined)
  return (
    <div class={STACK}>
      <FieldShell label="Full name" description="Shown on your profile." error={nameError()}>
        <TextField value={state.name} onInput={(event) => setState('name', event.currentTarget.value)} />
      </FieldShell>
      <FieldShell label="Website">
        <TextField
          value={state.website}
          addonStart="https://"
          mono
          action={
            <ClipboardCopyButton text={`https://${state.website}`} tooltips={{idle: 'Copy link'}} class="size-8" />
          }
          onInput={(event) => setState('website', event.currentTarget.value)}
        />
      </FieldShell>
      <FieldShell label="Username" error={usernameError()}>
        <TextField value={state.username} mono onInput={(event) => setState('username', event.currentTarget.value)} />
      </FieldShell>
      <FieldShell label="Account id" readOnly>
        <TextField value="acct_8f2c" addonEnd=".id" mono />
      </FieldShell>
      <FieldShell label="Company" description="Join an organization first." disabled>
        <TextField value="" placeholder="Not set" />
      </FieldShell>
      <FieldShell label="Bio" description="A few words about you." error={bioError()}>
        <TextArea
          value={state.bio}
          placeholder="Write something short."
          minRows={3}
          maxRows={10}
          onInput={(event) => setState('bio', event.currentTarget.value)}
        />
        <Show when={state.bio.length > 0}>
          <span class={COUNTER} classList={{'text-chat-danger': state.bio.length > NOTE_LIMIT}}>
            {`${COUNT_FORMAT.format(state.bio.length)} / ${COUNT_FORMAT.format(NOTE_LIMIT)}`}
          </span>
        </Show>
      </FieldShell>
    </div>
  )
}

export const States: Story = {render: () => <TextStates />}

export const Variants: Story = {
  render: () => (
    <div class="p-4 flex flex-col gap-3 w-80 [background:var(--chat-bg)]">
      <TextField aria-label="Filled" placeholder="Filled" />
      <TextField aria-label="Outline" placeholder="Outline" variant="outline" />
      <TextField aria-label="Filled invalid" value="bad value" aria-invalid="true" />
      <TextField aria-label="Outline invalid" value="bad value" aria-invalid="true" variant="outline" />
      <TextField aria-label="Filled disabled" value="locked" disabled />
      <TextField aria-label="Outline disabled" value="locked" disabled variant="outline" />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('textbox', {name: 'Filled'})).toBeVisible()
    await expect(canvas.getByRole('textbox', {name: 'Outline'})).toBeVisible()
    await expect(canvas.getByRole('textbox', {name: 'Outline invalid'})).toHaveAttribute('aria-invalid', 'true')
    await expect(canvas.getByRole('textbox', {name: 'Outline disabled'})).toBeDisabled()
  },
}

export const Keyboard: Story = {
  render: () => <TextStates />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const name = canvas.getByRole('textbox', {name: 'Full name'})
    await expect(name).toHaveAccessibleDescription('Shown on your profile.')
    const username = canvas.getByRole('textbox', {name: 'Username'})
    await expect(username).toHaveAccessibleDescription(/Use lowercase letters, digits and underscores\./)
    await expect(username).toHaveAttribute('aria-invalid', 'true')

    await userEvent.click(name)
    await userEvent.clear(name)
    await expect(canvas.getByText('Enter your name.')).toBeVisible()
    await expect(name).toHaveAttribute('aria-invalid', 'true')
    await userEvent.type(name, 'Grace')
    await waitFor(() => expect(name).not.toHaveAttribute('aria-invalid', 'true'))
    await expect(name).toHaveValue('Grace')

    await userEvent.tab()
    const website = canvas.getByRole('textbox', {name: 'Website'})
    await expect(website).toHaveFocus()
    await userEvent.tab()
    await expect(canvas.getByRole('button', {name: 'Copy link'})).toHaveFocus()
    await userEvent.tab()
    await expect(username).toHaveFocus()
    await userEvent.clear(username)
    await userEvent.type(username, 'grace_h')
    await waitFor(() => expect(username).not.toHaveAttribute('aria-invalid', 'true'))

    await expect(canvas.getByRole('textbox', {name: 'Account id'})).toHaveAttribute('readonly')
    await expect(canvas.getByRole('textbox', {name: 'Company'})).toBeDisabled()

    const bio = canvas.getByRole('textbox', {name: 'Bio'})
    await userEvent.type(
      bio,
      'Writes compilers, teaches maths, and walks the dog twice a day without fail, rain or shine.',
    )
    await expect(canvas.getByText('91 / 80')).toBeVisible()
    await expect(canvas.getByText('Keep it under 80 characters.')).toBeVisible()
    await expect(bio).toHaveAttribute('aria-invalid', 'true')
  },
}
