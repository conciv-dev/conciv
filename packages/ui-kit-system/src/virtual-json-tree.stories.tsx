import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import ChevronRight from 'lucide-solid/icons/chevron-right'
import {VirtualJsonTree} from './virtual-json-tree.js'

const meta: Meta<typeof VirtualJsonTree> = {
  title: 'ui-kit-system/VirtualJsonTree',
  component: VirtualJsonTree,
}
export default meta
type Story = StoryObj<typeof VirtualJsonTree>

const SHELL =
  '[font-family:var(--chat-mono)] text-[length:var(--chat-text-xs)] max-h-[13.75rem] w-full rounded-[var(--chat-radius-sm)] [background:var(--chat-sunken)] [border:1px_solid_var(--chat-line-soft)] overflow-auto p-1.5 text-chat-text-2'

const ROLES = ['button', 'link', 'textbox', 'heading', 'listitem']

function snapshot(): unknown {
  return {
    url: 'https://conciv.dev/pricing',
    title: 'Pricing',
    nodes: Array.from({length: 96}, (_, index) => ({
      ref: `e${index + 1}`,
      role: ROLES[index % ROLES.length],
      name: `Interactive element number ${index + 1} on the pricing page`,
      rect: {x: index * 7, y: index * 13, width: 240, height: 32},
      visible: index % 3 !== 0,
    })),
    warnings: [],
  }
}

function Demo() {
  return (
    <div class="w-100">
      <VirtualJsonTree
        data={snapshot()}
        defaultExpandedDepth={1}
        collapseStringsAfterLength={60}
        maxPreviewItems={5}
        groupArraysAfterLength={20}
        class={`json-tree ${SHELL}`}
        arrow={<ChevronRight size={12} aria-hidden="true" />}
      />
    </div>
  )
}

export const PageSnapshot: Story = {
  render: () => <Demo />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const nodes = canvas.getByRole('button', {name: /^nodes:/})
    await expect(nodes).toBeVisible()
    await userEvent.click(nodes)
    await waitFor(() => expect(canvas.getByRole('button', {name: /^0: Object/})).toBeVisible())
  },
}
