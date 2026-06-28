import {For, Show, type Component, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {ChatSessionMeta} from '@mandarax/protocol/chat-types'
import {Primitive} from '../util/primitive.js'
import {createActionButton} from '../util/create-action-button.js'
import {ThreadListItemProvider, useThreadList, useThreadListItem} from './thread-list-context.js'

function Root(props: JSX.HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <Primitive.div {...props} />
}

const New = createActionButton('New chat', () => {
  const list = useThreadList()
  return () => ({run: () => list.create()})
})

const LoadMore = createActionButton('Load more', () => {
  const list = useThreadList()
  return () => (list.hasMore?.() ? {run: () => list.loadMore?.()} : null)
})

type ItemsProps = {archived?: boolean} & (
  | {components: {ThreadListItem: Component}; children?: never}
  | {children: (session: () => ChatSessionMeta) => JSX.Element; components?: never}
)

function Items(props: ItemsProps): JSX.Element {
  const list = useThreadList()
  const each = () => (props.archived ? (list.archived?.() ?? []) : list.sessions())
  const itemComponent = () => ('components' in props && props.components ? props.components.ThreadListItem : undefined)
  const renderChildren = 'children' in props ? props.children : undefined
  return (
    <For each={each()}>
      {(session) => (
        <ThreadListItemProvider value={session}>
          <Show when={itemComponent()} fallback={renderChildren ? renderChildren(() => session) : null}>
            {(component) => <Dynamic component={component()} />}
          </Show>
        </ThreadListItemProvider>
      )}
    </For>
  )
}

export const ThreadList = Object.assign(Root, {Root, New, Items, LoadMore})

function ItemRoot(props: JSX.HTMLAttributes<HTMLDivElement>): JSX.Element {
  const session = useThreadListItem()
  const list = useThreadList()
  const active = () => list.activeId() === session.id
  return (
    <Primitive.div data-active={active() ? '' : undefined} aria-current={active() ? 'true' : undefined} {...props} />
  )
}

const ItemTrigger = createActionButton('Open chat', () => {
  const session = useThreadListItem()
  const list = useThreadList()
  return () => ({run: () => list.select(session.id)})
})

function ItemTitle(props: {fallback?: JSX.Element}): JSX.Element {
  const session = useThreadListItem()
  return <>{session.title || props.fallback || 'New chat'}</>
}

const ItemArchive = createActionButton('Archive', () => {
  const session = useThreadListItem()
  const list = useThreadList()
  return () => (list.archive ? {run: () => list.archive?.(session.id)} : null)
})

const ItemUnarchive = createActionButton('Unarchive', () => {
  const session = useThreadListItem()
  const list = useThreadList()
  return () => (list.unarchive ? {run: () => list.unarchive?.(session.id)} : null)
})

const ItemDelete = createActionButton('Delete', () => {
  const session = useThreadListItem()
  const list = useThreadList()
  return () => (list.remove ? {run: () => list.remove?.(session.id)} : null)
})

export const ThreadListItem = Object.assign(ItemRoot, {
  Root: ItemRoot,
  Trigger: ItemTrigger,
  Title: ItemTitle,
  Archive: ItemArchive,
  Unarchive: ItemUnarchive,
  Delete: ItemDelete,
})
