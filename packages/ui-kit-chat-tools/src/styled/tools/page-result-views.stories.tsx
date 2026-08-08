import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, waitFor} from 'storybook/test'
import {A11yNodeList, PageHtmlBlock, PageValueChip} from './page-result-views.js'

const meta: Meta = {title: 'ui-kit-chat-tools/styled/PageResultViews'}
export default meta
type Story = StoryObj

function frame(child: JSX.Element): JSX.Element {
  return (
    <div class="chat-theme-dark p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]">{child}</div>
  )
}

export const NodeList: Story = {
  render: () =>
    frame(
      <A11yNodeList
        nodes={[
          {role: 'button', name: 'Ship it', ref: 'e12'},
          {role: 'textbox', name: 'Email', ref: 'e13'},
        ]}
      />,
    ),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Ship it')).toBeVisible()
    await expect(canvas.getByText('e13')).toBeVisible()
  },
}

export const HtmlBlock: Story = {
  render: () => frame(<PageHtmlBlock markup='<section id="hero"><h1>Ship it</h1></section>' />),
  play: async ({canvasElement}) => {
    await waitFor(() =>
      expect(
        Array.from(canvasElement.querySelectorAll('diffs-container'))
          .map((host) => host.shadowRoot?.textContent ?? '')
          .join('\n'),
      ).toContain('hero'),
    )
  },
}

export const ValueChip: Story = {
  render: () => frame(<PageValueChip value="ada@example.com" />),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('ada@example.com')).toBeVisible()
  },
}
