import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {For} from 'solid-js'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {useFilter} from '@ark-ui/solid/locale'
import {useListCollection} from '@ark-ui/solid/combobox'
import {Combobox} from './combobox.js'

const meta: Meta<typeof Combobox.Root> = {title: 'ui-kit/Combobox', component: Combobox.Root}
export default meta
type Story = StoryObj<typeof Combobox.Root>

const CONTENT =
  'p-1 border border-pw-line-2 rounded-pw-md bg-pw-panel flex flex-col w-64 shadow-pw-lg z-10 [outline:none] data-[state=open]:anim-combo'
const ITEM =
  'flex items-center gap-2 py-1.5 px-2 rounded-pw-sm text-pw-text cursor-pointer data-[highlighted]:bg-pw-fill-strong'

function Demo() {
  const filterFn = useFilter({sensitivity: 'base'})
  const {collection, filter} = useListCollection({
    initialItems: [
      {label: 'Claude Opus', value: 'opus'},
      {label: 'Claude Sonnet', value: 'sonnet'},
      {label: 'Claude Haiku', value: 'haiku'},
    ],
    filter: filterFn().contains,
  })
  return (
    <Combobox.Root openOnClick collection={collection()} onInputValueChange={(d) => filter(d.inputValue)} class="w-64">
      <Combobox.Control class="relative">
        <Combobox.Input
          class="text-pw-text font-pw px-3 border border-pw-line-2 rounded-pw-md bg-pw-fill h-9 w-full [outline:none]"
          placeholder="Pick a model"
        />
      </Combobox.Control>
      <Combobox.Positioner>
        <Combobox.Content class={CONTENT}>
          <For each={collection().items}>
            {(item) => (
              <Combobox.Item item={item} class={ITEM}>
                <Combobox.ItemText>{item.label}</Combobox.ItemText>
              </Combobox.Item>
            )}
          </For>
        </Combobox.Content>
      </Combobox.Positioner>
    </Combobox.Root>
  )
}

export const Default: Story = {
  render: () => <Demo />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const input = c.getByPlaceholderText('Pick a model')
    await expect(input).toBeVisible()
    await userEvent.click(input)
    await waitFor(() => expect(c.getByText('Claude Sonnet')).toBeVisible())
  },
}
