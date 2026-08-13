import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {CollapsibleSection} from './collapsible-section.js'

const meta: Meta = {title: 'ui-kit-chat/styled/tools/CollapsibleSection'}
export default meta
type Story = StoryObj

function frame(child: JSX.Element): JSX.Element {
  return (
    <div class="chat-theme-dark p-4 rounded-[var(--chat-radius-md)] w-[30rem] [background:var(--chat-fill)] [border:1px_solid_var(--chat-line)] [font-family:var(--chat-font)]">
      {child}
    </div>
  )
}

export const NestedInsideCardBody: Story = {
  render: () =>
    frame(
      <>
        <p class="text-[color:var(--chat-text)] text-[length:var(--chat-text-md)] m-0 mb-2">tool-card body content</p>
        <CollapsibleSection header={<span>src/utils/format.ts</span>}>
          <span>3 assertions failed</span>
        </CollapsibleSection>
      </>,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole('button', {name: 'src/utils/format.ts'})
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(canvas.queryByText('3 assertions failed')).toBeNull()

    await userEvent.click(trigger)
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'))
    await waitFor(() => expect(canvas.getByText('3 assertions failed')).toBeVisible())
  },
}

export const DefaultOpen: Story = {
  render: () =>
    frame(
      <CollapsibleSection header={<span>src/utils/parse.ts</span>} defaultOpen>
        <span>all 5 tests passed</span>
      </CollapsibleSection>,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', {name: 'src/utils/parse.ts'})).toHaveAttribute('aria-expanded', 'true')
    await expect(canvas.getByText('all 5 tests passed')).toBeVisible()
  },
}

const LONG_CONTENT = Array.from({length: 12}, (_, index) => `test case ${index + 1}: renders without throwing`).join(
  '\n',
)

export const LongContent: Story = {
  render: () =>
    frame(
      <CollapsibleSection header={<span>src/components/big-suite.test.ts</span>} defaultOpen>
        <div class="whitespace-pre-wrap">{LONG_CONTENT}</div>
      </CollapsibleSection>,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/test case 1:/)).toBeVisible()
    await expect(canvas.getByText(/test case 12:/)).toBeVisible()
  },
}
