import {For, Show, createEffect, createMemo, type JSX} from 'solid-js'
import {
  Button,
  LISTBOX_ITEM_DESCRIPTION,
  LIST_PANEL_MESSAGE,
  Listbox,
  Popover,
  createListCollection,
} from '@conciv/ui-kit-system'
import {isTriggerItem, type TriggerEntry} from './types.js'

export type TriggerMenuAnchor = {x: number; y: number; width: number; height: number}

const PANEL = 'w-72 max-h-64 overflow-y-auto overscroll-contain'
const BACK_ROW = 'flex px-1 pt-1'
const BACK = 'gap-1 text-pw-text-2'
const CHEVRON = 'ms-auto shrink-0 text-pw-text-3'
const UNGROUPED = ''

const describedById = (optionElementId: string): string => `${optionElementId}-description`

const groupOf = (entry: TriggerEntry): string => (isTriggerItem(entry) ? (entry.group ?? UNGROUPED) : UNGROUPED)

function Chevron(props: {direction: 'start' | 'end'}): JSX.Element {
  return (
    <svg
      class={props.direction === 'end' ? CHEVRON : 'shrink-0'}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={props.direction === 'end' ? 'M9 18l6-6-6-6' : 'M15 18l-6-6 6-6'} />
    </svg>
  )
}

export function TriggerMenu(props: {
  anchor: TriggerMenuAnchor | null
  label: string
  entries: readonly TriggerEntry[]
  highlightedId: string | undefined
  inert?: boolean
  message?: string
  listboxId?: string
  optionId?: (id: string) => string
  backLabel?: string
  onBack?: () => void
  onSelect: (entry: TriggerEntry) => void
  onHighlight?: (index: number) => void
  onDismiss?: () => void
  renderOption?: (entry: TriggerEntry) => JSX.Element
}): JSX.Element {
  const inert = () => props.inert === true
  const collection = createMemo(() =>
    createListCollection({
      items: [...props.entries],
      itemToValue: (entry: TriggerEntry) => entry.id,
      itemToString: (entry: TriggerEntry) => entry.label,
      groupBy: (entry: TriggerEntry) => (props.backLabel === undefined ? groupOf(entry) : UNGROUPED),
    }),
  )
  const elementId = (id: string | number) => props.optionId?.(String(id)) ?? String(id)
  const selectById = (id: string) => {
    const entry = props.entries.find((candidate) => candidate.id === id)
    if (!entry || inert()) return
    props.onSelect(entry)
  }
  const highlightById = (id: string) => {
    const index = props.entries.findIndex((candidate) => candidate.id === id)
    if (index >= 0) props.onHighlight?.(index)
  }
  const optionContent = (entry: TriggerEntry) => (props.renderOption ? props.renderOption(entry) : entry.label)
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
                <Show when={props.backLabel}>
                  {(label) => (
                    <div class={BACK_ROW}>
                      <Button
                        variant="ghost"
                        size="sm"
                        class={BACK}
                        onPointerDown={(event) => event.preventDefault()}
                        onClick={() => props.onBack?.()}
                      >
                        <Chevron direction="start" />
                        {label()}
                      </Button>
                    </div>
                  )}
                </Show>
                <Listbox.Root
                  collection={collection()}
                  ids={{content: props.listboxId, item: elementId}}
                  highlightedValue={props.highlightedId ?? null}
                  selectionMode="none"
                  typeahead={false}
                  disabled={inert()}
                >
                  <Listbox.Label class="sr-only">{props.label}</Listbox.Label>
                  <Listbox.Content class={PANEL} tabIndex={-1}>
                    <For each={collection().group()}>
                      {([group, entries], position) => (
                        <Listbox.ItemGroup id={`trigger-menu-group-${position()}`}>
                          <Show when={group !== UNGROUPED}>
                            <Listbox.ItemGroupLabel>{group}</Listbox.ItemGroupLabel>
                          </Show>
                          <For each={entries}>
                            {(entry: TriggerEntry) => (
                              <Listbox.Item
                                item={entry}
                                aria-label={entry.label}
                                aria-selected={entry.id === props.highlightedId}
                                aria-describedby={entry.description ? describedById(elementId(entry.id)) : undefined}
                                onPointerDown={(event) => event.preventDefault()}
                                onPointerMove={() => highlightById(entry.id)}
                                onClick={() => selectById(entry.id)}
                              >
                                <span class="flex gap-1.5 w-full items-center">
                                  <Listbox.ItemText>{optionContent(entry)}</Listbox.ItemText>
                                  <Show when={!isTriggerItem(entry)}>
                                    <Chevron direction="end" />
                                  </Show>
                                </span>
                                <Show when={entry.description}>
                                  {(description) => (
                                    <span id={describedById(elementId(entry.id))} class={LISTBOX_ITEM_DESCRIPTION}>
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
