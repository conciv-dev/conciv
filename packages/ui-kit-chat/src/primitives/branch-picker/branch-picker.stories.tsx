import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within} from 'storybook/test'
import {BranchPicker} from './branch-picker.js'

const meta: Meta = {title: 'primitives/BranchPicker'}
export default meta
type Story = StoryObj

export const InertSingleBranch: Story = {
  render: () => (
    <BranchPicker.Root class="text-[0.75rem] text-pw-text-2 flex gap-1 items-center">
      <BranchPicker.Previous class="px-1 disabled:opacity-40">‹</BranchPicker.Previous>
      <span>
        <BranchPicker.Number /> / <BranchPicker.Count />
      </span>
      <BranchPicker.Next class="px-1 disabled:opacity-40">›</BranchPicker.Next>
    </BranchPicker.Root>
  ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('1 / 1')).toBeVisible()
    await expect(c.getByRole('button', {name: 'Previous'})).toBeDisabled()
    await expect(c.getByRole('button', {name: 'Next'})).toBeDisabled()
  },
}

export const HiddenWhenSingleBranch: Story = {
  render: () => (
    <div>
      <span>before</span>
      <BranchPicker.Root hideWhenSingleBranch>
        <BranchPicker.Count />
      </BranchPicker.Root>
      <span>after</span>
    </div>
  ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('before')).toBeVisible()
    await expect(c.getByText('after')).toBeVisible()
  },
}
