import {For, Show, createEffect, createMemo, type JSX} from 'solid-js'
import {
  LISTBOX_ITEM_DESCRIPTION,
  LIST_PANEL_MESSAGE,
  Listbox,
  Popover,
  createListCollection,
} from '@conciv/ui-kit-system'

export type SuggestionOption = {id: string; label: string; group?: string; description?: string}

export type SuggestionAnchor = {x: number; y: number; width: number; height: number}

const PANEL = 'w-72 max-h-64 overflow-y-auto overscroll-contain'

const UNGROUPED = ''

const describedById = (optionElementId: string): string => `${optionElementId}-description`

export function SuggestionListbox<Option extends SuggestionOption>(props: {
  anchor: SuggestionAnchor | null
  label: string
  options: Option[]
  activeIndex: number
  inert?: boolean
  message?: string
  listboxId?: string
  optionId?: (id: string) => string
  onSelect: (option: Option) => void
  onDismiss?: () => void
  renderOption?: (option: Option) => JSX.Element
}): JSX.Element {
  const inert = () => props.inert === true
  const collection = createMemo(() =>
    createListCollection({
      items: props.options,
      itemToValue: (option: Option) => option.id,
      itemToString: (option: Option) => option.label,
      groupBy: (option: Option) => option.group ?? UNGROUPED,
    }),
  )
  const highlighted = () => props.options[props.activeIndex]?.id ?? null
  const elementId = (id: string | number) => props.optionId?.(String(id)) ?? String(id)
  const selectById = (id: string) => {
    const option = props.options.find((candidate) => candidate.id === id)
    if (!option || inert()) return
    props.onSelect(option)
  }
  const optionContent = (option: Option) => (props.renderOption ? props.renderOption(option) : option.label)
  return (
    <Popover.Root
      open={props.anchor !== null}
      lazyMount
      unmountOnExit
      autoFocus={false}
      modal={false}
      portalled={false}
      closeOnEscape={false}
      closeOnInteractOutside={false}
      onEscapeKeyDown={(event) => {
        event.stopPropagation()
        props.onDismiss?.()
      }}
      positioning={{placement: 'top-start', flip: true, getAnchorRect: () => props.anchor}}
    >
      <Popover.Context>
        {(api) => {
          createEffect(() => {
            if (!props.anchor) return
            api().reposition()
          })
          return (
            <Popover.Positioner>
              <Popover.ListContent>
                <Listbox.Root
                  collection={collection()}
                  ids={{content: props.listboxId, item: elementId}}
                  highlightedValue={highlighted()}
                  selectionMode="none"
                  typeahead={false}
                  disabled={inert()}
                >
                  <Listbox.Label class="sr-only">{props.label}</Listbox.Label>
                  <Listbox.Content class={PANEL} tabIndex={-1}>
                    <For each={collection().group()}>
                      {([group, items], position) => (
                        <Listbox.ItemGroup id={`suggestion-group-${position()}`}>
                          <Show when={group !== UNGROUPED}>
                            <Listbox.ItemGroupLabel>{group}</Listbox.ItemGroupLabel>
                          </Show>
                          <For each={items}>
                            {(option: Option) => (
                              <Listbox.Item
                                item={option}
                                aria-label={option.label}
                                aria-selected={option.id === highlighted()}
                                aria-describedby={option.description ? describedById(elementId(option.id)) : undefined}
                                onPointerDown={(event) => event.preventDefault()}
                                onClick={() => selectById(option.id)}
                              >
                                <Listbox.ItemText>{optionContent(option)}</Listbox.ItemText>
                                <Show when={option.description}>
                                  {(description) => (
                                    <span id={describedById(elementId(option.id))} class={LISTBOX_ITEM_DESCRIPTION}>
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
                </Listbox.Root>
                <Show when={props.message}>
                  {(text) => (
                    <div role="status" class={LIST_PANEL_MESSAGE}>
                      {text()}
                    </div>
                  )}
                </Show>
              </Popover.ListContent>
            </Popover.Positioner>
          )
        }}
      </Popover.Context>
    </Popover.Root>
  )
}
