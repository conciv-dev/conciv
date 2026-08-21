import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, waitFor, within} from 'storybook/test'
import {Markdown} from './markdown.js'

const meta: Meta = {title: 'ui-kit-chat/styled/Markdown'}
export default meta
type Story = StoryObj

const RAMP = [
  '## Scaffolded the panel',
  '',
  'It was scaling by a cached ratio. I now read `devicePixelRatio` on every resize and reset the transform before each paint, so it stays **sharp at 1x, 2x and fractional** scaling.',
  '',
  '### Files it touched',
  '',
  '- `FrameBackdrop.tsx` keeps the existing theme override',
  '- `PigCanvas.tsx` is a **standalone** component',
].join('\n')

function frame(child: JSX.Element): JSX.Element {
  return (
    <div class="chat-theme-terminal p-4 w-[26rem] [background:var(--chat-bg)] [font-family:var(--chat-font)] [color:var(--chat-text)]">
      {child}
    </div>
  )
}

export const ProseRamp: Story = {
  render: () => frame(<Markdown content={RAMP} />),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByRole('heading', {name: 'Scaffolded the panel'})).toBeVisible())
    await waitFor(() => expect(canvas.getByRole('heading', {name: 'Files it touched'})).toBeVisible())
    await waitFor(() => expect(canvas.getByText('devicePixelRatio')).toBeVisible())
  },
}
