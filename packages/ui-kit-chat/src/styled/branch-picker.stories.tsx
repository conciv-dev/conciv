import {createSignal, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {BranchProvider, type BranchState} from '../primitives/branch-picker/branch-picker.js'
import {BranchPicker} from './branch-picker.js'

const meta: Meta = {title: 'styled/BranchPicker'}
export default meta
type Story = StoryObj

// A host-supplied branch model with two siblings, so the (otherwise-inert) picker renders + navigates.
// index is exposed via a getter so the context value stays reactive across clicks.
function Frame(): JSX.Element {
  const [index, setIndex] = createSignal(0)
  const branch: BranchState = {
    count: 2,
    get index() {
      return index()
    },
    previous: () => setIndex((value) => Math.max(0, value - 1)),
    next: () => setIndex((value) => Math.min(1, value + 1)),
  }
  return (
    <div class="p-4 [background:var(--chat-bg)]">
      <BranchProvider value={branch}>
        <BranchPicker />
      </BranchProvider>
    </div>
  )
}

export const TwoBranches: Story = {
  render: () => <Frame />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    // Renders "1 / 2"; Previous disabled at the first branch, Next enabled.
    const next = await waitFor(() => c.getByRole('button', {name: 'Next'}))
    await expect(c.getByRole('button', {name: 'Previous'})).toBeDisabled()
    await expect(next).toBeEnabled()
    await userEvent.click(next)
    // At the last branch: Next disabled, Previous enabled.
    await waitFor(() => expect(c.getByRole('button', {name: 'Next'})).toBeDisabled())
    await expect(c.getByRole('button', {name: 'Previous'})).toBeEnabled()
  },
}

export const HiddenWhenSingleBranch: Story = {
  render: () => (
    <div class="p-4 [background:var(--chat-bg)]">
      <BranchPicker />
    </div>
  ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    // Default inert model is a single branch → hideWhenSingleBranch renders nothing.
    await expect(c.queryByRole('button', {name: 'Next'})).toBeNull()
  },
}
