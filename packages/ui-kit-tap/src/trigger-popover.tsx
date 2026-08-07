import {For, Show, type JSX} from 'solid-js'
import type {RichTextFieldTriggerItem, TriggerPopoverState, TriggerPopoverStatus} from './trigger-suggestions.js'

const PANEL =
  'fixed z-[2147483647] min-w-44 max-w-72 max-h-56 overflow-auto rounded-pw-md bg-pw-panel text-pw-text border border-pw-line shadow-pw-lg p-1'
const OPTION =
  'block px-2 py-1.5 rounded-pw-sm text-[0.8125rem] cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap aria-selected:bg-pw-fill'
const STATUS = 'px-2 py-1.5 text-[0.8125rem] text-pw-text-3'

const STATUS_MESSAGES: Record<TriggerPopoverStatus, string> = {
  loading: 'Loading suggestions…',
  error: 'Suggestions failed to load',
  ready: 'No matches',
}

export function TriggerListbox(props: {
  state: TriggerPopoverState | null
  listboxId: string
  optionId: (item: RichTextFieldTriggerItem) => string
}): JSX.Element {
  return (
    <Show when={props.state}>
      {(state) => (
        <Show when={state().rect}>
          {(rect) => (
            <div class={PANEL} style={{left: `${rect().left}px`, top: `${rect().top}px`}}>
              <ul role="listbox" id={props.listboxId} aria-label={state().sourceLabel}>
                <For each={state().items}>
                  {(item, position) => (
                    <li
                      role="option"
                      id={props.optionId(item)}
                      aria-selected={position() === state().activeIndex ? 'true' : 'false'}
                      class={OPTION}
                      onPointerDown={(event) => {
                        event.preventDefault()
                        state().command(item)
                      }}
                    >
                      {item.label}
                    </li>
                  )}
                </For>
              </ul>
              <Show when={state().items.length === 0}>
                <div role="status" class={STATUS}>
                  {STATUS_MESSAGES[state().status]}
                </div>
              </Show>
            </div>
          )}
        </Show>
      )}
    </Show>
  )
}
