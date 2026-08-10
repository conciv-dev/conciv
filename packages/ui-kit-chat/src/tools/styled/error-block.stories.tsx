import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within} from 'storybook/test'
import {ErrorBlock} from './error-block.js'

const meta: Meta = {title: 'ui-kit-chat/styled/ErrorBlock'}
export default meta
type Story = StoryObj

function frame(child: JSX.Element): JSX.Element {
  return (
    <div class="chat-theme-dark p-4 w-[34rem] [background:var(--chat-bg)] [font-family:var(--chat-font)]">{child}</div>
  )
}

export const Default: Story = {
  render: () => frame(<ErrorBlock message="nothing on the page matches that selector" />),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Error')).toBeVisible()
    await expect(canvas.getByText('nothing on the page matches that selector')).toBeVisible()
  },
}

export const CustomLabel: Story = {
  render: () => frame(<ErrorBlock label="Build failed" message="exit code 1: 3 tests failed" />),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Build failed')).toBeVisible()
    await expect(canvas.getByText('exit code 1: 3 tests failed')).toBeVisible()
  },
}

const LONG_MESSAGE =
  'the sandbox process exited unexpectedly while running the build script; this can happen when the container ' +
  'runs out of memory or when a native dependency fails to compile on the current platform. check the logs above ' +
  'for the underlying stack trace before retrying.'

export const LongMessage: Story = {
  render: () => frame(<ErrorBlock message={LONG_MESSAGE} />),
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(LONG_MESSAGE)).toBeVisible()
  },
}
