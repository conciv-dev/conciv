import 'virtual:uno.css'
import {createSignal, onMount, type Component, type JSX, type ParentProps} from 'solid-js'
import {page} from 'vitest/browser'
import {afterEach, expect, it} from 'vitest'
import {useChat} from '@tanstack/ai-solid'
import {ChatProvider} from '../src/store/chat-context.js'
import {storyConnection} from '../src/store/story-connection.js'
import {Composer} from '../src/styled/composer.js'
import {Thread} from '../src/styled/thread.js'
import {ModelSelector} from '../src/styled/model-selector.js'
import {HARNESS_MODELS} from './model-selector-harness.js'
import {cleanupViews, mountView} from './mount-view.js'

afterEach(() => {
  cleanupViews()
})

function createSlotProbe(label: string): Component {
  const [instances, setInstances] = createSignal(0)
  return () => {
    onMount(() => setInstances(instances() + 1))
    return (
      <span>
        {label} instances: {instances()}
      </span>
    )
  }
}

function ChatHost(props: ParentProps): JSX.Element {
  const chat = useChat({connection: storyConnection()})
  return <ChatProvider chat={chat}>{props.children}</ChatProvider>
}

async function expectSingleInstance(label: string): Promise<void> {
  await expect.element(page.getByText(`${label} instances: 1`), {timeout: 2000}).toBeVisible()
}

it('builds the composer children slot exactly once', async () => {
  const Probe = createSlotProbe('composer children')
  mountView(() => (
    <ChatHost>
      <Composer>
        <Probe />
      </Composer>
    </ChatHost>
  ))

  await expectSingleInstance('composer children')
})

it('builds the composer busy slot exactly once', async () => {
  const Probe = createSlotProbe('composer busy')
  mountView(() => (
    <ChatHost>
      <Composer busy={<Probe />} />
    </ChatHost>
  ))

  await expectSingleInstance('composer busy')
})

it('builds thread viewport children exactly once', async () => {
  const Probe = createSlotProbe('thread footer')
  mountView(() => (
    <ChatHost>
      <Thread>
        <Thread.Viewport>
          <Thread.Messages />
          <Probe />
        </Thread.Viewport>
      </Thread>
    </ChatHost>
  ))

  await expectSingleInstance('thread footer')
})

it('builds thread welcome children exactly once', async () => {
  const Probe = createSlotProbe('thread welcome')
  mountView(() => (
    <ChatHost>
      <Thread>
        <Thread.Viewport>
          <Thread.Welcome>
            <Probe />
          </Thread.Welcome>
          <Thread.Messages />
        </Thread.Viewport>
      </Thread>
    </ChatHost>
  ))

  await expectSingleInstance('thread welcome')
})

it('builds thread composer children exactly once', async () => {
  const Probe = createSlotProbe('thread composer region')
  mountView(() => (
    <ChatHost>
      <Thread>
        <Thread.Viewport>
          <Thread.Messages />
        </Thread.Viewport>
        <Thread.Composer>
          <Probe />
        </Thread.Composer>
      </Thread>
    </ChatHost>
  ))

  await expectSingleInstance('thread composer region')
})

it('builds the model selector trigger slot exactly once', async () => {
  const Probe = createSlotProbe('trigger children')
  mountView(() => (
    <ModelSelector.Root models={HARNESS_MODELS} defaultValue="claude-opus-4-8">
      <ModelSelector.Trigger>
        <Probe />
      </ModelSelector.Trigger>
    </ModelSelector.Root>
  ))

  await expectSingleInstance('trigger children')
})
