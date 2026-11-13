import {createMemo, For} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {createStore} from 'solid-js/store'
import Check from 'lucide-solid/icons/check'
import ChevronDown from 'lucide-solid/icons/chevron-down'
import {FieldShell} from './field-shell.js'
import {createListCollection, Select} from './select.js'

const meta: Meta = {title: 'ui-kit-system/Select'}
export default meta
type Story = StoryObj

const STACK = 'flex flex-col gap-5 w-120 max-w-full'
const NOTE = 'text-[0.75rem] text-chat-text-2'
const LANGUAGES = [
  {value: 'en', label: 'English'},
  {value: 'fr', label: 'French'},
  {value: 'ja', label: 'Japanese'},
]
const COUNTRIES = [
  {value: 'pt', label: 'Portugal'},
  {value: 'no', label: 'Norway'},
]

function Choice(props: {
  options: {value: string; label: string}[]
  value: string
  placeholder?: string
  onValueChange?: (value: string) => void
}) {
  const collection = createMemo(() => createListCollection({items: props.options}))
  return (
    <Select.Root
      class="min-w-48"
      collection={collection()}
      value={props.value === '' ? [] : [props.value]}
      onValueChange={(details) => {
        const [next] = details.value
        if (next !== undefined) props.onValueChange?.(next)
      }}
    >
      <Select.Control>
        <Select.Trigger>
          <Select.ValueText placeholder={props.placeholder ?? 'Choose one'} />
          <ChevronDown class="text-chat-text-3 shrink-0 size-3.5" aria-hidden="true" />
        </Select.Trigger>
      </Select.Control>
      <Select.Positioner>
        <Select.Content>
          <For each={collection().items}>
            {(item) => (
              <Select.Item item={item}>
                <Select.ItemText>{item.label}</Select.ItemText>
                <Select.ItemIndicator>
                  <Check class="text-chat-accent size-3.5" aria-hidden="true" />
                </Select.ItemIndicator>
              </Select.Item>
            )}
          </For>
        </Select.Content>
      </Select.Positioner>
      <Select.HiddenSelect />
    </Select.Root>
  )
}

function SelectStates() {
  const [state, setState] = createStore({language: 'en', country: ''})
  return (
    <div class={STACK}>
      <FieldShell label="Language" description="Used for dates and numbers." layout="row">
        <Choice options={LANGUAGES} value={state.language} onValueChange={(value) => setState('language', value)} />
      </FieldShell>
      <FieldShell label="Country" layout="row" error={state.country === '' ? 'Choose a country.' : undefined}>
        <Choice
          options={COUNTRIES}
          value={state.country}
          placeholder="Choose a country"
          onValueChange={(value) => setState('country', value)}
        />
      </FieldShell>
      <FieldShell label="Currency" layout="row" readOnly>
        <Choice options={[{value: 'eur', label: 'Euro'}]} value="eur" />
      </FieldShell>
      <FieldShell label="Region" description="Choose a country first." layout="row" disabled>
        <Choice options={[{value: 'north', label: 'North'}]} value="" placeholder="None" />
      </FieldShell>
      <p class={NOTE}>Language {state.language}</p>
    </div>
  )
}

export const States: Story = {render: () => <SelectStates />}

export const Keyboard: Story = {
  render: () => <SelectStates />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const page = within(canvasElement.ownerDocument.body)
    const language = canvas.getByRole('combobox', {name: 'Language'})
    await expect(language).toHaveAccessibleDescription('Used for dates and numbers.')
    await expect(canvas.getByRole('combobox', {name: 'Country'})).toHaveAccessibleDescription(/Choose a country\./)

    await userEvent.click(language)
    await expect(page.getByRole('option', {name: 'French'})).toBeVisible()
    await userEvent.click(page.getByRole('option', {name: 'Japanese'}))
    await waitFor(() => expect(language).toHaveTextContent('Japanese'))
    await expect(language).toHaveFocus()
    await expect(canvas.getByText('Language ja')).toBeVisible()

    const country = canvas.getByRole('combobox', {name: 'Country'})
    await userEvent.tab()
    await expect(country).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(page.getByRole('listbox', {name: 'Country'})).toHaveFocus())
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(country).toHaveTextContent('Norway'))
    await expect(canvas.queryByText('Choose a country.')).toBeNull()
    await expect(country).toHaveFocus()

    await expect(canvas.getByRole('combobox', {name: 'Region'})).toBeDisabled()
  },
}
