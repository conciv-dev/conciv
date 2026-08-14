import 'virtual:uno.css'
import {onMount, type JSX} from 'solid-js'
import {page} from 'vitest/browser'
import {expect, it} from 'vitest'
import {useChat} from '@tanstack/ai-solid'
import type {MessagePart, UIMessage} from '@tanstack/ai-client'
import {ChatProvider} from '../src/store/chat-context.js'
import type {GroupEntry, Grouper, GroupKey, GroupRenderProps, Grouping} from '../src/store/grouping.js'
import {storyConnection} from '../src/store/story-connection.js'
import {Message} from '../src/primitives/message/message.js'
import {Thread} from '../src/styled/thread.js'
import {Activity} from '../src/styled/activity.js'
import {mountView} from './mount-view.js'

const OUTER_KEY: GroupKey = 'group-outer'
const INNER_KEY: GroupKey = 'group-inner'
const MYSTERY_KEY: GroupKey = 'group-mystery'

function grouperByText(pathOf: (content: string) => readonly GroupKey[] | null): Grouper {
  return (parts) =>
    parts.map((part) => {
      if (part.type !== 'text') return null
      return pathOf(part.content)
    })
}

function wrapperEntry(key: GroupKey, label: string): GroupEntry {
  return {
    key,
    render: (props: GroupRenderProps) => (
      <div>
        <span>{label}</span>
        {props.children}
      </div>
    ),
  }
}

function messagesWith(parts: MessagePart[]): UIMessage[] {
  return [
    {id: 'u1', role: 'user', parts: [{type: 'text', content: 'go'}]},
    {id: 'a1', role: 'assistant', parts},
  ]
}

function staticThread(
  parts: MessagePart[],
  grouping: Grouping,
  groupEntries: readonly GroupEntry[],
): () => JSX.Element {
  return function StaticThread(): JSX.Element {
    const chat = useChat({connection: storyConnection()})
    onMount(() => chat.setMessages(messagesWith(parts)))
    return (
      <ChatProvider chat={chat}>
        <Thread>
          <Thread.Viewport>
            <Thread.Messages grouping={grouping} groupEntries={groupEntries} />
          </Thread.Viewport>
        </Thread>
      </ChatProvider>
    )
  }
}

it('renders a registered child entry inside its parent entry children slot', async () => {
  const grouping: Grouping = {grouper: grouperByText(() => [OUTER_KEY, INNER_KEY]), context: {}}
  mountView(
    staticThread([{type: 'text', content: 'nested body'}], grouping, [
      wrapperEntry(OUTER_KEY, 'outer wrapper'),
      wrapperEntry(INNER_KEY, 'inner wrapper'),
    ]),
  )

  await expect.element(page.getByText('outer wrapper'), {timeout: 3000}).toBeVisible()
  await expect.element(page.getByText('inner wrapper'), {timeout: 3000}).toBeVisible()
  await expect.element(page.getByText('nested body'), {timeout: 3000}).toBeVisible()
})

it('flattens an unregistered child group key and renders its leaves in place', async () => {
  const grouping: Grouping = {grouper: grouperByText(() => [OUTER_KEY, MYSTERY_KEY]), context: {}}
  mountView(
    staticThread([{type: 'text', content: 'nested body'}], grouping, [wrapperEntry(OUTER_KEY, 'outer wrapper')]),
  )

  await expect.element(page.getByText('outer wrapper'), {timeout: 3000}).toBeVisible()
  await expect.element(page.getByText('nested body'), {timeout: 3000}).toBeVisible()
})

it('flattens an unregistered top-level group key without a wrapper', async () => {
  const grouping: Grouping = {grouper: grouperByText(() => [MYSTERY_KEY]), context: {}}
  mountView(staticThread([{type: 'text', content: 'top body'}], grouping, []))

  await expect.element(page.getByText('top body'), {timeout: 3000}).toBeVisible()
})

function staticActivity(
  parts: MessagePart[],
  grouping: Grouping,
  groupEntries: readonly GroupEntry[],
): () => JSX.Element {
  return function StaticActivity(): JSX.Element {
    return (
      <Activity messages={messagesWith(parts)} grouping={grouping} groupEntries={groupEntries}>
        <Activity.Timeline aria-label="activity" />
      </Activity>
    )
  }
}

it('recursively dispatches registered child entries in the activity timeline', async () => {
  const grouping: Grouping = {grouper: grouperByText(() => [OUTER_KEY, INNER_KEY]), context: {}}
  mountView(
    staticActivity([{type: 'text', content: 'nested body'}], grouping, [
      wrapperEntry(OUTER_KEY, 'outer wrapper'),
      wrapperEntry(INNER_KEY, 'inner wrapper'),
    ]),
  )

  await expect.element(page.getByText('outer wrapper'), {timeout: 3000}).toBeVisible()
  await expect.element(page.getByText('inner wrapper'), {timeout: 3000}).toBeVisible()
  await expect.element(page.getByText('nested body'), {timeout: 3000}).toBeVisible()
})

it('flattens an unregistered child group key in the activity timeline', async () => {
  const grouping: Grouping = {grouper: grouperByText(() => [OUTER_KEY, MYSTERY_KEY]), context: {}}
  mountView(
    staticActivity([{type: 'text', content: 'nested body'}], grouping, [wrapperEntry(OUTER_KEY, 'outer wrapper')]),
  )

  await expect.element(page.getByText('outer wrapper'), {timeout: 3000}).toBeVisible()
  await expect.element(page.getByText('nested body'), {timeout: 3000}).toBeVisible()
})

function groupedPartsThread(parts: MessagePart[], grouping: Grouping): () => JSX.Element {
  const GroupWrapper = (props: {indices: readonly number[]; groupKey: GroupKey; children?: JSX.Element}) => (
    <div>
      <span>{`wrap ${props.groupKey}`}</span>
      {props.children}
    </div>
  )
  const GroupedAssistant = (): JSX.Element => (
    <Message.Unstable_PartsGrouped grouping={grouping} components={{Group: GroupWrapper}} />
  )
  return function GroupedPartsThread(): JSX.Element {
    const chat = useChat({connection: storyConnection()})
    onMount(() => chat.setMessages(messagesWith(parts)))
    return (
      <ChatProvider chat={chat}>
        <Thread>
          <Thread.Viewport>
            <Thread.Messages components={{AssistantMessage: GroupedAssistant}} />
          </Thread.Viewport>
        </Thread>
      </ChatProvider>
    )
  }
}

it('wraps every level of a nested path through the grouped primitive', async () => {
  const grouping: Grouping = {grouper: grouperByText(() => [OUTER_KEY, INNER_KEY]), context: {}}
  mountView(groupedPartsThread([{type: 'text', content: 'nested body'}], grouping))

  await expect.element(page.getByText('wrap group-outer'), {timeout: 3000}).toBeVisible()
  await expect.element(page.getByText('wrap group-inner'), {timeout: 3000}).toBeVisible()
  await expect.element(page.getByText('nested body'), {timeout: 3000}).toBeVisible()
})

it('suppresses every wrapper of a nested group whose descendants render nothing', async () => {
  const grouping: Grouping = {
    grouper: (parts) => parts.map((part) => (part.type === 'structured-output' ? [OUTER_KEY, INNER_KEY] : [])),
    context: {},
  }
  mountView(
    groupedPartsThread(
      [
        {type: 'structured-output', status: 'complete', raw: '{}'},
        {type: 'text', content: 'visible reply'},
      ],
      grouping,
    ),
  )

  await expect.element(page.getByText('visible reply'), {timeout: 3000}).toBeVisible()
  await expect.element(page.getByText('wrap group-outer')).not.toBeInTheDocument()
  await expect.element(page.getByText('wrap group-inner')).not.toBeInTheDocument()
})
