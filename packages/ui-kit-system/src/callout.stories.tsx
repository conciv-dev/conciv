import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within} from 'storybook/test'
import Lock from 'lucide-solid/icons/lock'
import {Button} from './button.js'
import {Callout} from './callout.js'

const meta: Meta = {title: 'ui-kit-system/Callout'}
export default meta
type Story = StoryObj

export const Info: Story = {
  render: () => (
    <Callout.Root>
      <Callout.Icon />
      <Callout.Title>Sessions sync across tabs</Callout.Title>
      <Callout.Description>Open conciv in another tab and the same transcript follows you there.</Callout.Description>
    </Callout.Root>
  ),
  play: async ({canvasElement}) => {
    await expect(within(canvasElement).getByRole('note')).toHaveTextContent('Sessions sync across tabs')
  },
}

export const Success: Story = {
  render: () => (
    <Callout.Root tone="success">
      <Callout.Icon />
      <Callout.Title>Figma is connected</Callout.Title>
      <Callout.Description>The agent can now read frames from the files you share with it.</Callout.Description>
    </Callout.Root>
  ),
  play: async ({canvasElement}) => {
    await expect(within(canvasElement).getByRole('note')).toHaveTextContent('Figma is connected')
  },
}

export const Warn: Story = {
  render: () => (
    <Callout.Root tone="warn">
      <Callout.Icon />
      <Callout.Title>The token expires in 3 days</Callout.Title>
      <Callout.Description>Paste a new one before then or Figma calls will stop working.</Callout.Description>
    </Callout.Root>
  ),
  play: async ({canvasElement}) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent('The token expires in 3 days')
  },
}

export const Danger: Story = {
  render: () => (
    <Callout.Root tone="danger">
      <Callout.Icon />
      <Callout.Title>Figma rejected the key</Callout.Title>
      <Callout.Description>Check that the key has file read access, then save it again.</Callout.Description>
    </Callout.Root>
  ),
  play: async ({canvasElement}) => {
    await expect(within(canvasElement).getByRole('alert')).toHaveTextContent('Figma rejected the key')
  },
}

export const CustomIcon: Story = {
  render: () => (
    <Callout.Root tone="success">
      <Callout.Icon>
        <Lock />
      </Callout.Icon>
      <Callout.Title>Your key stays private</Callout.Title>
      <Callout.Description>
        Saved on this computer and used only to call Figma. The agent never sees it.
      </Callout.Description>
    </Callout.Root>
  ),
  play: async ({canvasElement}) => {
    await expect(within(canvasElement).getByRole('note')).toHaveTextContent('Your key stays private')
  },
}

export const WithAction: Story = {
  render: () => (
    <Callout.Root tone="warn">
      <Callout.Icon />
      <Callout.Title>Figma is not connected</Callout.Title>
      <Callout.Description>Add a personal access token so the agent can read your designs.</Callout.Description>
      <div class="pt-1">
        <Button variant="outline" size="sm">
          Connect Figma
        </Button>
      </div>
    </Callout.Root>
  ),
  play: async ({canvasElement}) => {
    const callout = within(within(canvasElement).getByRole('status'))
    await expect(callout.getByRole('button', {name: 'Connect Figma'})).toBeVisible()
  },
}

export const TitleOnly: Story = {
  render: () => (
    <Callout.Root>
      <Callout.Icon />
      <Callout.Title>Changes apply to every session</Callout.Title>
    </Callout.Root>
  ),
  play: async ({canvasElement}) => {
    await expect(within(canvasElement).getByRole('note')).toHaveTextContent('Changes apply to every session')
  },
}
