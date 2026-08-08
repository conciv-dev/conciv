import {For, Show, createEffect, type JSX} from 'solid-js'
import {LIST_PANEL_ITEM, LIST_PANEL_MESSAGE, Popover} from '@conciv/ui-kit-system'

export type SuggestionOption = {id: string; label: string}

export type SuggestionAnchor = {x: number; y: number; width: number; height: number}

const LIST = 'max-h-56 max-w-72 overflow-y-auto'
const OPTION = `${LIST_PANEL_ITEM} overflow-hidden text-ellipsis whitespace-nowrap aria-selected:bg-pw-fill-strong aria-selected:text-pw-text aria-disabled:opacity-50 aria-disabled:cursor-default`

const ariaSelected = (selected: boolean): 'true' | 'false' => (selected ? 'true' : 'false')

const ariaDisabled = (inert: boolean): 'true' | undefined => (inert ? 'true' : undefined)

function OptionRow(props: {
  id: string | undefined
  selected: boolean
  inert: boolean
  onSelect: () => void
  content: JSX.Element
}): JSX.Element {
  return (
    <li
      role="option"
      id={props.id}
      aria-selected={ariaSelected(props.selected)}
      aria-disabled={ariaDisabled(props.inert)}
      class={OPTION}
      onPointerDown={(event) => {
        event.preventDefault()
        props.onSelect()
      }}
    >
      {props.content}
    </li>
  )
}

export function SuggestionListbox<Option extends SuggestionOption>(props: {
  anchor: SuggestionAnchor | null
  label: string
  options: Option[]
  activeIndex: number
  inert?: boolean
  message?: string
  listboxId?: string
  optionId?: (option: Option) => string
  onSelect: (option: Option) => void
  onDismiss?: () => void
  renderOption?: (option: Option) => JSX.Element
}): JSX.Element {
  let list: HTMLUListElement | undefined
  const inert = () => props.inert === true
  const selectOption = (option: Option) => {
    if (inert()) return
    props.onSelect(option)
  }
  const optionContent = (option: Option) => (props.renderOption ? props.renderOption(option) : option.label)
  createEffect(() => {
    const element = list?.children.item(props.activeIndex)
    if (element instanceof HTMLElement) element.scrollIntoView({block: 'nearest'})
  })
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
      onEscapeKeyDown={() => props.onDismiss?.()}
      positioning={{placement: 'bottom-start', getAnchorRect: () => props.anchor}}
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
                <ul
                  ref={(element) => (list = element)}
                  class={LIST}
                  role="listbox"
                  id={props.listboxId}
                  aria-label={props.label}
                >
                  <For each={props.options}>
                    {(option, position) => (
                      <OptionRow
                        id={props.optionId?.(option)}
                        selected={position() === props.activeIndex}
                        inert={inert()}
                        onSelect={() => selectOption(option)}
                        content={optionContent(option)}
                      />
                    )}
                  </For>
                </ul>
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
