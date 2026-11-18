import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {STORY_FRAME_CLASS, StoryTool, storyCall} from './story.fixtures.js'
import {traceGallery, traceRow} from './trace.fixtures.js'

const meta: Meta = {title: 'Extensions/Page/tool/ReactCard'}
export default meta
type Story = StoryObj

export const LocatedSource: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <StoryTool
        call={storyCall(
          'page_locate',
          {selector: '#checkout'},
          {
            component: 'CheckoutButton',
            stack: ['CheckoutButton', 'CheckoutForm'],
            frames: [{fileName: 'src/checkout/button.tsx', line: 42, fn: 'CheckoutButton'}],
            source: {file: 'src/checkout/button.tsx', line: 42, column: 3},
          },
        )}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Located the source')).toBeVisible()
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('CheckoutButton')).toBeVisible())
    await waitFor(() => expect(canvas.getByText('src/checkout/button.tsx:42')).toBeVisible())
  },
}

export const InspectedProps: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <StoryTool
        call={storyCall(
          'page_inspect',
          {selector: '#checkout'},
          {
            component: 'CheckoutButton',
            props: {label: 'Ship it', disabled: false},
            state: null,
            hooks: [{id: 0, value: 'idle'}],
          },
        )}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('CheckoutButton')).toBeVisible())
    await waitFor(() => expect(canvas.getByText('props')).toBeVisible())
  },
}

export const RenderCounts: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <StoryTool
        call={storyCall(
          'page_track',
          {action: 'report'},
          {
            tracking: true,
            tracked: 2,
            timingsAvailable: false,
            components: [
              {component: 'CheckoutForm', renders: 12, lastReason: 'props changed'},
              {component: 'PriceLabel', renders: 1, lastReason: 'parent render'},
            ],
            note: 'render durations need a profiling build (react-dom/profiling or <Profiler>)',
          },
        )}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('12 renders')).toBeVisible())
    await waitFor(() => expect(canvas.getByText('1 render')).toBeVisible())
  },
}

export const NoRenders: Story = {
  render: () => (
    <div class={STORY_FRAME_CLASS}>
      <StoryTool
        call={storyCall(
          'page_track',
          {action: 'report'},
          {tracking: true, tracked: 0, timingsAvailable: true, components: []},
        )}
      />
    </div>
  ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button'))
    await waitFor(() => expect(canvas.getByText('no re-renders were recorded')).toBeVisible())
  },
}

export const Trace: Story = {
  render: () =>
    traceGallery('1 tree', [
      traceRow(
        storyCall(
          'page_tree',
          {selector: '#checkout'},
          {
            nodes: [
              {
                component: 'CheckoutForm',
                ref: 'e1',
                children: [
                  {component: 'EmailField', ref: 'e2', children: []},
                  {component: 'SubmitButton', ref: 'e3', children: []},
                ],
              },
            ],
            truncated: 0,
          },
        ),
      ),
    ]),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Read the page tree')).toBeVisible()
    await expect(canvas.getByText('#checkout')).toBeVisible()
    await waitFor(() => expect(canvas.getByText(/nodes:/)).toBeVisible())
  },
}
