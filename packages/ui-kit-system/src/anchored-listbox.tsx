import {Show, createEffect, createUniqueId, on, onCleanup, onMount, type JSX} from 'solid-js'
import {Listbox, useListbox, useListboxContext, type CollectionItem, type ListCollection} from '@ark-ui/solid/listbox'
import {
  LIST_PANEL_GROUP_LABEL,
  LIST_PANEL_ITEM,
  LIST_PANEL_ITEM_DESCRIPTION,
  LIST_PANEL_ITEM_LABEL,
  LIST_PANEL_MESSAGE,
} from './list-panel.js'
import {Popover} from './popover.js'

export type AnchoredListboxRect = {x: number; y: number; width: number; height: number}

export type AnchoredListboxHandle = {
  listboxId: string
  activeOptionId: () => string | undefined
  handleKeyDown: (event: KeyboardEvent) => boolean
}

const CONTENT = 'flex flex-col max-h-64 max-w-80 overflow-y-auto overscroll-contain outline-none'
const ITEM = `${LIST_PANEL_ITEM} flex-col items-stretch gap-0.5 min-h-11 data-[active]:bg-pw-fill-strong data-[active]:text-pw-text`
const HIDDEN_INPUT = 'sr-only'

function Root(props: {
  anchor: AnchoredListboxRect
  collection: ListCollection<CollectionItem>
  children: JSX.Element
  onSelect: (value: string) => void
  onDismiss: () => void
  onReady?: (handle: AnchoredListboxHandle | null) => void
}): JSX.Element {
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

  onMount(() => props.onReady?.({listboxId, activeOptionId, handleKeyDown}))
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
              <Popover.ListContent>
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
  return <Listbox.Label class="sr-only">{props.children}</Listbox.Label>
}

function Content(props: {busy?: boolean; children: JSX.Element}): JSX.Element {
  return (
    <Listbox.Content class={CONTENT} aria-busy={props.busy ? 'true' : undefined}>
      {props.children}
    </Listbox.Content>
  )
}

function ItemGroup(props: {id: string; children: JSX.Element}): JSX.Element {
  return <Listbox.ItemGroup id={props.id}>{props.children}</Listbox.ItemGroup>
}

function ItemGroupLabel(props: {children: JSX.Element}): JSX.Element {
  return <Listbox.ItemGroupLabel class={LIST_PANEL_GROUP_LABEL}>{props.children}</Listbox.ItemGroupLabel>
}

function Item(props: {item: CollectionItem; name: string; description?: string; children: JSX.Element}): JSX.Element {
  const listbox = useListboxContext()
  const descriptionId = createUniqueId()
  const active = () => listbox().highlightedValue === listbox().getItemState({item: props.item}).value
  return (
    <Listbox.Item
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
  return <Listbox.ItemText class={LIST_PANEL_ITEM_LABEL}>{props.children}</Listbox.ItemText>
}

function Message(props: {children: JSX.Element}): JSX.Element {
  return (
    <div role="status" class={LIST_PANEL_MESSAGE}>
      {props.children}
    </div>
  )
}

export const AnchoredListbox = {Root, Label, Content, ItemGroup, ItemGroupLabel, Item, ItemText, Message}
