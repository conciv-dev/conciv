import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, userEvent, waitFor, within} from 'storybook/test'
import {TraceOutputBlock} from './output-block.js'

const meta: Meta = {title: 'ui-kit-chat/styled/trace/OutputBlock'}
export default meta
type Story = StoryObj

const STDOUT = [
  '> conciv@0.0.19 build',
  '> vite build',
  '',
  'dist/index.js   233.54 kB │ gzip: 62.69 kB',
  '✓ built in 630ms',
].join('\n')

const STDERR = [
  'src/store/turn-rollup.ts(42,11): error TS2345:',
  "  Argument of type 'string' is not assignable to parameter of type 'number'.",
].join('\n')

function frame(child: JSX.Element): JSX.Element {
  return (
    <div class="chat-theme-terminal p-4 rounded-[var(--chat-radius-md)] flex flex-col gap-3 w-[34rem] [background:var(--chat-panel)] [border:1px_solid_var(--chat-line)] [font-family:var(--chat-font)]">
      {child}
    </div>
  )
}

export const Normal: Story = {
  render: () => frame(<TraceOutputBlock text={STDOUT}>{STDOUT}</TraceOutputBlock>),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('group', {name: 'Output'})).toBeVisible()
  },
}

export const ErrorTone: Story = {
  render: () =>
    frame(
      <TraceOutputBlock tone="error" text={STDERR}>
        {STDERR}
      </TraceOutputBlock>,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('group', {name: 'Error output'})).toBeVisible()
  },
}

export const HoverActions: Story = {
  render: () =>
    frame(
      <TraceOutputBlock text={STDOUT} onOpen={() => {}}>
        {STDOUT}
      </TraceOutputBlock>,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const copyBtn = canvas.getByRole('button', {name: 'Copy'})
    await expect(copyBtn).not.toBeVisible()
    await userEvent.tab()
    await waitFor(() => expect(copyBtn).toBeVisible())
    await expect(canvas.getByRole('button', {name: 'Open'})).toBeVisible()
  },
}
