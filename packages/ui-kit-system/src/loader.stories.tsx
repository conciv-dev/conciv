import {For} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {Loader, type LoaderSize} from './loader.js'

const meta: Meta = {title: 'ui-kit-system/Loader'}
export default meta
type Story = StoryObj

const SIZES: LoaderSize[] = ['sm', 'md', 'lg']

export const Default: Story = {
  render: () => (
    <Loader.Root translations={{value: () => 'Loading conciv'}}>
      <Loader.Indicator />
      <Loader.Text>
        <Loader.Label>Loading conciv…</Loader.Label>
        <Loader.Description>Restoring your session and its transcript.</Loader.Description>
      </Loader.Text>
    </Loader.Root>
  ),
}

export const Sizes: Story = {
  render: () => (
    <div class="flex flex-wrap gap-4 items-start">
      <For each={SIZES}>
        {(size) => (
          <Loader.Root size={size} translations={{value: () => `Loading ${size}`}}>
            <Loader.Indicator />
            <Loader.Text>
              <Loader.Label>Loading conciv…</Loader.Label>
              <Loader.Description>Size {size}</Loader.Description>
            </Loader.Text>
          </Loader.Root>
        )}
      </For>
    </div>
  ),
}

export const TitleOnly: Story = {
  render: () => (
    <Loader.Root size="sm" translations={{value: () => 'Loading conciv'}}>
      <Loader.Indicator />
      <Loader.Text>
        <Loader.Label>Loading conciv…</Loader.Label>
      </Loader.Text>
    </Loader.Root>
  ),
}

export const OnAccent: Story = {
  render: () => (
    <div class="text-chat-on-accent rounded-chat-surface-lg bg-chat-accent">
      <Loader.Root translations={{value: () => 'Loading conciv'}}>
        <Loader.Indicator />
        <Loader.Text>
          <Loader.Label>Loading conciv…</Loader.Label>
          <Loader.Description>The orb is drawn in currentColor, so it inherits any surface.</Loader.Description>
        </Loader.Text>
      </Loader.Root>
    </div>
  ),
}

export const SwappedIndicator: Story = {
  render: () => (
    <Loader.Root translations={{value: () => 'Loading conciv'}}>
      <Loader.Indicator class="grid place-items-center">
        <span class="border-2 border-chat-line border-t-chat-accent rounded-chat-pill size-6 anim-compact" />
      </Loader.Indicator>
      <Loader.Text>
        <Loader.Label>Loading conciv…</Loader.Label>
        <Loader.Description>Any children replace the default orb.</Loader.Description>
      </Loader.Text>
    </Loader.Root>
  ),
}
