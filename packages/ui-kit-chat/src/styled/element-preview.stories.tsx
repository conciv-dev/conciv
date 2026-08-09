import type {JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, waitFor} from 'storybook/test'
import type {ElementCapture} from '@conciv/protocol/element-capture-types'
import {
  ELEMENT_CAPTURE_FIXTURE_CSS,
  ELEMENT_CAPTURE_FIXTURE_DESCRIPTOR_ONLY,
  ELEMENT_CAPTURE_FIXTURE_EDIT_AFTER,
  ELEMENT_CAPTURE_FIXTURE_EDIT_BEFORE,
  ELEMENT_CAPTURE_FIXTURE_FULL,
  ELEMENT_CAPTURE_FIXTURE_MASKED,
} from '../store/element-capture.fixtures.js'
import {ElementPreview} from './element-preview.js'

const meta: Meta = {title: 'ui-kit-chat/styled/ElementPreview'}
export default meta
type Story = StoryObj

const NO_TARGET_MARKER_CAPTURE: ElementCapture = {
  kind: 'after',
  ts: Date.now(),
  descriptor: {tagName: 'input', role: 'textbox', accessibleName: 'orphaned field', selectorPath: 'input#orphan'},
  node: {
    type: 2,
    tagName: 'html',
    attributes: {},
    childNodes: [
      {
        type: 2,
        tagName: 'body',
        attributes: {},
        childNodes: [
          {type: 2, tagName: 'input', attributes: {id: 'orphan', value: 'no marker'}, childNodes: [], id: 1},
        ],
        id: 2,
      },
    ],
    id: 3,
  },
}

function frame(child: JSX.Element): JSX.Element {
  return (
    <div class="chat-theme-dark p-4 w-[20rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]">{child}</div>
  )
}

export const FullCapture: Story = {
  render: () =>
    frame(
      <ElementPreview.Root capture={ELEMENT_CAPTURE_FIXTURE_FULL} css={ELEMENT_CAPTURE_FIXTURE_CSS}>
        <ElementPreview.Frame />
      </ElementPreview.Root>,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByRole('img', {name: 'Email'})).toBeVisible())
  },
}

export const DescriptorOnly: Story = {
  render: () =>
    frame(
      <ElementPreview.Root capture={ELEMENT_CAPTURE_FIXTURE_DESCRIPTOR_ONLY}>
        <ElementPreview.Descriptor />
      </ElementPreview.Root>,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Email')).toBeVisible()
    await expect(canvas.getByText('textbox')).toBeVisible()
    await expect(canvas.getByText('ada@example.com')).toBeVisible()
  },
}

export const BeforeAfterPair: Story = {
  render: () =>
    frame(
      <div class="flex flex-col gap-2">
        <ElementPreview.Root capture={ELEMENT_CAPTURE_FIXTURE_EDIT_BEFORE} css={ELEMENT_CAPTURE_FIXTURE_CSS}>
          <ElementPreview.Frame />
        </ElementPreview.Root>
        <ElementPreview.Root capture={ELEMENT_CAPTURE_FIXTURE_EDIT_AFTER} css={ELEMENT_CAPTURE_FIXTURE_CSS}>
          <ElementPreview.Frame />
        </ElementPreview.Root>
      </div>,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByRole('img', {name: 'Submit order'})).toBeVisible())
    await waitFor(() => expect(canvas.getByRole('img', {name: 'Order placed'})).toBeVisible())
  },
}

export const MaskedField: Story = {
  render: () =>
    frame(
      <ElementPreview.Root capture={ELEMENT_CAPTURE_FIXTURE_MASKED} css={ELEMENT_CAPTURE_FIXTURE_CSS}>
        <ElementPreview.Frame />
      </ElementPreview.Root>,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByRole('img', {name: 'input'})).toBeVisible())
  },
}

export const FailedBuildDegradesToDescriptor: Story = {
  render: () =>
    frame(
      <ElementPreview.Root capture={NO_TARGET_MARKER_CAPTURE}>
        <ElementPreview.Frame />
        <ElementPreview.Descriptor />
      </ElementPreview.Root>,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText('orphaned field')).toBeVisible())
    await expect(canvas.getByText('textbox')).toBeVisible()
    await expect(canvasElement.querySelector('[role="img"]')).toBeNull()
  },
}
