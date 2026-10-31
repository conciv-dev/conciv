import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {createSignal} from 'solid-js'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import Strikethrough from 'lucide-solid/icons/strikethrough'
import Italic from 'lucide-solid/icons/italic'
import Underline from 'lucide-solid/icons/underline'
import Link from 'lucide-solid/icons/link'
import Code from 'lucide-solid/icons/code'
import {Tooltip} from './tooltip.js'
import {TooltipIconButton} from './tooltip-icon-button.js'

type ToolbarArgs = {openDelay: number; warmWindow: number; travel: number; lean: number; fuse: boolean}

const meta: Meta = {title: 'ui-kit-system/Tooltip'}
export default meta
type Story = StoryObj
type ToolbarStory = StoryObj<ToolbarArgs>

export const Default: Story = {
  render: () => {
    const [content, setContent] = createSignal<HTMLElement>()
    return (
      <>
        <Tooltip.Root openDelay={0} closeDelay={0}>
          <Tooltip.Trigger class="text-chat-accent-link underline cursor-pointer">Reload</Tooltip.Trigger>
          <Tooltip.Positioner>
            <Tooltip.Content ref={setContent}>Regenerate this response</Tooltip.Content>
          </Tooltip.Positioner>
        </Tooltip.Root>
        <p>{content() ? 'Content ref attached' : 'Content ref missing'}</p>
      </>
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await userEvent.hover(c.getByText('Reload'))
    await waitFor(() => expect(c.getByText('Regenerate this response')).toBeVisible())
    await expect(c.getByText('Content ref attached')).toBeVisible()
  },
}

export const Toolbar: ToolbarStory = {
  args: {openDelay: 1200, warmWindow: 600, travel: 320, lean: 6, fuse: true},
  argTypes: {
    openDelay: {control: {type: 'range', min: 0, max: 2000, step: 50}},
    warmWindow: {control: {type: 'range', min: 0, max: 2000, step: 50}},
    travel: {control: {type: 'range', min: 0, max: 1000, step: 20}},
    lean: {control: {type: 'range', min: 0, max: 20, step: 1}},
    fuse: {control: 'boolean'},
  },
  render: (args) => (
    <div role="toolbar" aria-label="Formatting" class="pt-12 flex gap-1">
      <Tooltip.Group
        openDelay={args.openDelay}
        warmWindow={args.warmWindow}
        travel={args.travel}
        lean={args.lean}
        fuse={args.fuse}
      >
        <TooltipIconButton tooltip="Strikethrough" shortcut="⌘⇧X">
          <Strikethrough class="size-4" aria-hidden="true" />
        </TooltipIconButton>
        <TooltipIconButton tooltip="Italic" shortcut="⌘I">
          <Italic class="size-4" aria-hidden="true" />
        </TooltipIconButton>
        <TooltipIconButton tooltip="Underline" shortcut="⌘U">
          <Underline class="size-4" aria-hidden="true" />
        </TooltipIconButton>
        <TooltipIconButton tooltip="Insert link to another page" shortcut="⌘K">
          <Link class="size-4" aria-hidden="true" />
        </TooltipIconButton>
        <TooltipIconButton tooltip="Code">
          <Code class="size-4" aria-hidden="true" />
        </TooltipIconButton>
      </Tooltip.Group>
    </div>
  ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const strikethrough = c.getByRole('button', {name: 'Strikethrough'})
    const italic = c.getByRole('button', {name: 'Italic'})
    const underline = c.getByRole('button', {name: 'Underline'})
    await expect(c.queryAllByRole('tooltip', {hidden: true})).toHaveLength(0)

    await userEvent.tab()
    await expect(strikethrough).toHaveFocus()
    const label = await c.findByRole('tooltip')
    await expect(label).toHaveTextContent('Strikethrough')
    await expect(c.getAllByRole('tooltip', {hidden: true})).toHaveLength(1)

    await userEvent.hover(italic)
    await waitFor(() => expect(c.getByRole('tooltip')).toHaveTextContent('Italic'))
    await expect(c.getByRole('tooltip')).toBe(label)
    await expect(c.getAllByRole('tooltip', {hidden: true})).toHaveLength(1)
    await expect(italic).toHaveAttribute('aria-describedby', label.id)
    await expect(italic).toHaveAccessibleDescription('Italic ⌘I')

    await userEvent.unhover(italic)
    await waitFor(() => expect(c.queryByRole('tooltip')).toBeNull())

    await userEvent.hover(underline)
    const reopened = await c.findByRole('tooltip')
    await expect(reopened).toHaveTextContent('Underline')
    await expect(underline).toHaveAttribute('aria-describedby', reopened.id)
    await expect(reopened).toBeVisible()

    await userEvent.hover(italic)
    await userEvent.hover(c.getByRole('button', {name: 'Insert link to another page'}))
    await userEvent.hover(c.getByRole('button', {name: 'Code'}))
    await waitFor(() => expect(c.getByRole('tooltip').textContent).toBe('Code'))
    await expect(c.getAllByRole('tooltip', {hidden: true})).toHaveLength(1)
  },
}
