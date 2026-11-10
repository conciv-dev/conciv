import {Show, createEffect, createUniqueId, on, onCleanup, onMount, splitProps, type JSX} from 'solid-js'
import {Listbox, useListbox, useListboxContext, type CollectionItem, type ListCollection} from '@ark-ui/solid/listbox'
import {
  LIST_PANEL_GROUP_LABEL,
  LIST_PANEL_ITEM,
  LIST_PANEL_ITEM_DESCRIPTION,
  LIST_PANEL_ITEM_LABEL,
  LIST_PANEL_MESSAGE,
} from './list-panel.js'
import {Popover} from './popover.js'

declare module 'solid-js' {
  namespace JSX {
    interface ExplicitAttributes {
      tabindex: null
    }
  }
}

export type AnchoredListboxRect = {x: number; y: number; width: number; height: number}

export type AnchoredListboxHandle = {
  listboxId: string
  activeOptionId: () => string | undefined
  commitHighlighted: () => boolean
  handleKeyDown: (event: KeyboardEvent) => boolean
}

const CONTENT = 'flex flex-col max-h-64 max-w-80 overflow-y-auto overscroll-contain outline-none'
const ITEM = `${LIST_PANEL_ITEM} flex-col items-stretch gap-0.5 min-h-11 data-[active]:bg-chat-fill-strong data-[active]:text-chat-text`
const HIDDEN_INPUT = 'sr-only'

function Root(props: {
  anchor: AnchoredListboxRect
  collection: ListCollection<CollectionItem>
  children: JSX.Element
  onSelect: (value: string) => void
  onDismiss: () => void
  onReady?: (handle: AnchoredListboxHandle | null) => void
}): JSX.Element {
  const [, rest] = splitProps(props, ['anchor', 'collection', 'children', 'onSelect', 'onDismiss', 'onReady'])
  let inputElement: HTMLInputElement | undefined
  const listboxId = createUniqueId()
  const listbox = useListbox(() => ({
    collection: props.collection,
    value: [],
    loopFocus: true,
    ids: {content: listboxId, item: (value: string | number) => `${listboxId}-option-${value}`},
    onSelect: (details) => props.onSelect(details.value),
  }))

  const activeOptionId = (): string | undefined => {
    const value = listbox().highlightedValue
    if (value === null) return undefined
    return `${listboxId}-option-${value}`
  }

  const commitHighlighted = (): boolean => {
    const value = listbox().highlightedValue
    if (value === null) return false
    listbox().selectValue(value)
    return true
  }

  const handleKeyDown = (event: KeyboardEvent): boolean => {
    if (!inputElement) return false
    const forwarded = new KeyboardEvent(event.type, event)
    inputElement.dispatchEvent(forwarded)
    if (!forwarded.defaultPrevented) return false
    event.preventDefault()
    return true
  }

  createEffect(
    on(
      () => props.collection,
      () => listbox().highlightFirst(),
    ),
  )

  onMount(() => props.onReady?.({listboxId, activeOptionId, commitHighlighted, handleKeyDown}))
  onCleanup(() => props.onReady?.(null))

  return (
    <Popover.Root
      open
      autoFocus={false}
      modal={false}
      portalled={false}
      closeOnEscape={false}
      closeOnInteractOutside={false}
      onEscapeKeyDown={(event) => {
        event.stopPropagation()
        props.onDismiss()
      }}
      positioning={{strategy: 'fixed', placement: 'bottom-start', gutter: 4, getAnchorRect: () => props.anchor}}
    >
      <Popover.Context>
        {(popover) => {
          createEffect(
            on(
              () => props.anchor,
              () => popover().reposition(),
            ),
          )
          return (
            <Popover.Positioner>
              <Popover.ListContent {...rest}>
                <Listbox.RootProvider value={listbox}>
                  <Listbox.Input
                    ref={(element) => (inputElement = element)}
                    readOnly
                    class={HIDDEN_INPUT}
                    tabIndex={-1}
                  />
                  {props.children}
                </Listbox.RootProvider>
              </Popover.ListContent>
            </Popover.Positioner>
          )
        }}
      </Popover.Context>
    </Popover.Root>
  )
}

function Label(props: {children: JSX.Element}): JSX.Element {
  const [local, rest] = splitProps(props, ['children'])
  return (
    <Listbox.Label {...rest} class="sr-only">
      {local.children}
    </Listbox.Label>
  )
}

function Content(props: {busy?: boolean; children: JSX.Element}): JSX.Element {
  const [local, rest] = splitProps(props, ['busy', 'children'])
  return (
    <Listbox.Content {...rest} class={CONTENT} attr:tabindex={null} aria-busy={local.busy ? 'true' : undefined}>
      {local.children}
    </Listbox.Content>
  )
}

function ItemGroup(props: {id: string; children: JSX.Element}): JSX.Element {
  return <Listbox.ItemGroup {...props} />
}

function ItemGroupLabel(props: {children: JSX.Element}): JSX.Element {
  return <Listbox.ItemGroupLabel {...props} class={LIST_PANEL_GROUP_LABEL} />
}

function Item(props: {item: CollectionItem; name: string; description?: string; children: JSX.Element}): JSX.Element {
  const [, rest] = splitProps(props, ['item', 'name', 'description', 'children'])
  const listbox = useListboxContext()
  const descriptionId = createUniqueId()
  const active = () => listbox().highlightedValue === listbox().getItemState({item: props.item}).value
  return (
    <Listbox.Item
      {...rest}
      item={props.item}
      highlightOnHover
      class={ITEM}
      data-active={active() ? '' : undefined}
      aria-label={props.name}
      aria-describedby={props.description ? descriptionId : undefined}
    >
      {props.children}
      <Show when={props.description}>
        {(text) => (
          <span id={descriptionId} class={LIST_PANEL_ITEM_DESCRIPTION}>
            {text()}
          </span>
        )}
      </Show>
    </Listbox.Item>
  )
}

function ItemText(props: {children: JSX.Element}): JSX.Element {
  return <Listbox.ItemText {...props} class={LIST_PANEL_ITEM_LABEL} />
}

function Message(props: {children: JSX.Element}): JSX.Element {
  return <div {...props} role="status" class={LIST_PANEL_MESSAGE} />
}

export const AnchoredListbox = {Root, Label, Content, ItemGroup, ItemGroupLabel, Item, ItemText, Message}
