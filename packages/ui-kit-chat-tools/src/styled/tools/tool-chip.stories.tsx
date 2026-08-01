import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {ToolChip} from './tool-chip.js'
import {schemaParams} from '../../primitives/tools/schema-params.js'

const meta: Meta = {title: 'ui-kit-chat-tools/styled/tools/ToolChip'}
export default meta
type Story = StoryObj

const SCHEMA = {
  type: 'object',
  properties: {seconds: {type: 'number'}, keyframes: {type: 'number'}},
  required: ['seconds'],
}

function frame(theme: string, child: JSX.Element): JSX.Element {
  return <div class={`${theme} p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]`}>{child}</div>
}

function tip(): JSX.Element {
  return (
    <div>
      <div>Animates the canvas over a duration</div>
      <div class="[color:var(--chat-text-3)] [font-family:var(--chat-mono)]">{schemaParams(SCHEMA)}</div>
    </div>
  )
}

export const Plain: Story = {
  render: () => frame('chat-theme-dark', <ToolChip name="canvas_svg" />),
  play: async ({canvasElement}) => {
    await expect(within(canvasElement).getByText('canvas_svg')).toBeVisible()
  },
}

export const Accent: Story = {
  render: () => frame('chat-theme-dark', <ToolChip name="canvas_animate" tone="new" tip={tip()} />),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await userEvent.hover(c.getByRole('button', {name: 'canvas_animate'}))
    await waitFor(() => expect(c.getByText('Animates the canvas over a duration')).toBeVisible())
    await expect(await c.findByText('seconds: number · keyframes?: number')).toBeVisible()
  },
}

export const Error: Story = {
  render: () => frame('chat-theme-dark', <ToolChip name="canvas_broken" tone="bad" />),
  play: async ({canvasElement}) => {
    await expect(within(canvasElement).getByText('canvas_broken')).toBeVisible()
  },
}

export const Light: Story = {
  render: () => frame('', <ToolChip name="canvas_svg" />),
}
