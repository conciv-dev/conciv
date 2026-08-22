import {For, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {Chip, ChipGroup, ChipRow} from './chip.js'

const meta: Meta = {title: 'ui-kit-chat/styled/Chip'}
export default meta
type Story = StoryObj

const TONES = ['neutral', 'accent', 'success', 'danger'] as const

function frame(child: JSX.Element): JSX.Element {
  return <div class="p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]">{child}</div>
}

export const FieldKind: Story = {
  render: () =>
    frame(
      <ChipRow>
        <For each={TONES}>{(tone) => <Chip kind="field" tone={tone} name={tone} value={`${tone} value`} />}</For>
      </ChipRow>,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    for (const tone of TONES) {
      await expect(canvas.getByText(tone)).toBeVisible()
      await expect(canvas.getByText(`${tone} value`)).toBeVisible()
    }
  },
}

export const PillKind: Story = {
  render: () =>
    frame(
      <ChipGroup>
        <For each={TONES}>{(tone) => <Chip kind="pill" tone={tone} value={`pill-${tone}`} />}</For>
      </ChipGroup>,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    for (const tone of TONES) {
      await expect(canvas.getByText(`pill-${tone}`)).toBeVisible()
    }
  },
}

export const PillWithTooltip: Story = {
  render: () => frame(<Chip kind="pill" tone="accent" value="npm run build" tooltip="Runs the project build script" />),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.hover(canvas.getByRole('button', {name: 'npm run build'}))
    await waitFor(() => expect(canvas.getByText('Runs the project build script')).toBeVisible())
  },
}

export const FieldWithTooltip: Story = {
  render: () =>
    frame(<Chip kind="field" name="selector" value="#submit" tooltip="The CSS selector that was matched" />),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.hover(canvas.getByRole('button', {name: 'selector #submit'}))
    await waitFor(() => expect(canvas.getByText('The CSS selector that was matched')).toBeVisible())
  },
}
