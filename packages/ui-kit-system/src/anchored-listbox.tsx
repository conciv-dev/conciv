import {For, Show, createEffect, createMemo, createUniqueId, on, onCleanup, onMount, type JSX} from 'solid-js'
import {Listbox, createListCollection, useListbox} from '@ark-ui/solid/listbox'
import {
  LIST_PANEL_GROUP_LABEL,
  LIST_PANEL_ITEM,
  LIST_PANEL_ITEM_DESCRIPTION,
  LIST_PANEL_ITEM_LABEL,
  LIST_PANEL_MESSAGE,
} from './list-panel.js'
import {Popover} from './popover.js'

export type AnchoredListboxRect = {x: number; y: number; width: number; height: number}

export type AnchoredListboxOption = {value: string; label: string; description?: string}

export type AnchoredListboxGroup = {id: string; label?: string; options: readonly AnchoredListboxOption[]}

export type AnchoredListboxHandle = {
  listboxId: string
  activeOptionId: () => string | undefined
  handleKeyDown: (event: KeyboardEvent) => boolean
}

const CONTENT = 'flex flex-col max-h-64 max-w-80 overflow-y-auto overscroll-contain outline-none'
const OPTION = `${LIST_PANEL_ITEM} flex-col items-start gap-0.5 min-h-11 data-[active]:bg-pw-fill-strong data-[active]:text-pw-text`
const HIDDEN_INPUT = 'sr-only'

function optionAccessibleDescriptionId(listboxId: string, value: string): string {
  return `${listboxId}-description-${value}`
}

export function AnchoredListbox(props: {
  anchor: AnchoredListboxRect
  label: string
  groups: readonly AnchoredListboxGroup[]
  message?: string
  busy?: boolean
  leading?: JSX.Element
  onSelect: (value: string) => void
  onDismiss: () => void
  onReady?: (handle: AnchoredListboxHandle | null) => void
}): JSX.Element {
  let inputElement: HTMLInputElement | undefined
  const listboxId = createUniqueId()
  const options = createMemo(() => props.groups.flatMap((group) => group.options))
  const collection = createMemo(() =>
    createListCollection({
      items: options(),
      itemToValue: (option) => option.value,
      itemToString: (option) => option.label,
    }),
  )
  const listbox = useListbox(() => ({
    collection: collection(),
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

  createEffect(on(collection, () => listbox().highlightFirst()))

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
                  <Listbox.Label class="sr-only">{props.label}</Listbox.Label>
                  <Listbox.Input
                    ref={(element) => (inputElement = element)}
                    readOnly
                    class={HIDDEN_INPUT}
                    tabIndex={-1}
                  />
                  {props.leading}
                  <Listbox.Content class={CONTENT} aria-busy={props.busy ? 'true' : undefined}>
                    <For each={props.groups}>
                      {(group) => (
                        <Listbox.ItemGroup id={group.id}>
                          <Show when={group.label}>
                            {(label) => (
                              <Listbox.ItemGroupLabel class={LIST_PANEL_GROUP_LABEL}>{label()}</Listbox.ItemGroupLabel>
                            )}
                          </Show>
                          <For each={group.options}>
                            {(option) => (
                              <Listbox.Item
                                item={option}
                                highlightOnHover
                                class={OPTION}
                                data-active={listbox().highlightedValue === option.value ? '' : undefined}
                                aria-label={option.label}
                                aria-describedby={
                                  option.description
                                    ? optionAccessibleDescriptionId(listboxId, option.value)
                                    : undefined
                                }
                              >
                                <Listbox.ItemText class={LIST_PANEL_ITEM_LABEL}>{option.label}</Listbox.ItemText>
                                <Show when={option.description}>
                                  {(description) => (
                                    <span
                                      id={optionAccessibleDescriptionId(listboxId, option.value)}
                                      class={LIST_PANEL_ITEM_DESCRIPTION}
                                    >
                                      {description()}
                                    </span>
                                  )}
                                </Show>
                              </Listbox.Item>
                            )}
                          </For>
                        </Listbox.ItemGroup>
                      )}
                    </For>
                  </Listbox.Content>
                  <Show when={props.message}>
                    {(text) => (
                      <div role="status" class={LIST_PANEL_MESSAGE}>
                        {text()}
                      </div>
                    )}
                  </Show>
                </Listbox.RootProvider>
              </Popover.ListContent>
            </Popover.Positioner>
          )
        }}
      </Popover.Context>
    </Popover.Root>
  )
}
