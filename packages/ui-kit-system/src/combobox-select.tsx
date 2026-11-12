import {createMemo, For, Show, splitProps, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {useFieldContext} from '@ark-ui/solid/field'
import {Combobox, createListCollection} from '@ark-ui/solid/combobox'
import {useFilter} from '@ark-ui/solid/locale'
import Check from 'lucide-solid/icons/check'
import ChevronsUpDown from 'lucide-solid/icons/chevrons-up-down'
import {INPUT_FRAME} from './input-frame.js'

const ROOT = 'min-w-0'
const CONTROL = `${INPUT_FRAME.filled} w-full min-w-48`
const INPUT =
  'flex-1 w-full min-w-0 bg-transparent [border:none] px-2.5 py-2 text-inherit [font:inherit] focus-visible:outline-none placeholder:text-chat-text-3 read-only:cursor-default'
const TRIGGER =
  'flex items-center justify-center shrink-0 w-8 bg-transparent [border:none] p-0 text-chat-text-3 cursor-pointer hover:text-chat-text-hi disabled:cursor-not-allowed'
const CONTENT =
  'hidden data-[state=open]:flex data-[state=open]:anim-combo flex-col gap-0.5 z-[2147483647] min-w-[var(--reference-width)] max-h-60 overflow-y-auto rounded-chat-surface-md bg-chat-panel text-chat-text [border:1px_solid_var(--chat-line)] shadow-chat-lg p-1 font-chat focus-visible:outline-none'
const ITEM =
  'flex items-center justify-between gap-2 min-h-8 py-1.5 px-2.5 rounded-chat-surface-sm text-[0.8125rem] text-chat-text cursor-pointer select-none data-[highlighted]:bg-chat-fill-strong data-[highlighted]:text-chat-text-hi data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed'
const META = 'font-chat-mono text-[0.6875rem] text-chat-text-3'
const EMPTY = 'py-2 px-2.5 text-[0.75rem] text-chat-text-3'

type ComboboxOption = {value: string; label: string; meta?: string}

type ComboboxSelectProps = {
  options: ComboboxOption[]
  value: string | undefined
  onValueChange?: (value: string) => void
  placeholder?: string
  emptyText?: string
  disabled?: boolean
  readOnly?: boolean
  invalid?: boolean
  class?: string
}

export function ComboboxSelect(props: ComboboxSelectProps): JSX.Element {
  const [local] = splitProps(props, [
    'options',
    'value',
    'onValueChange',
    'placeholder',
    'emptyText',
    'disabled',
    'readOnly',
    'invalid',
    'class',
  ])
  const field = useFieldContext()
  const filters = useFilter({sensitivity: 'base'})
  const [search, setSearch] = createStore({term: ''})
  const collection = createMemo(() =>
    createListCollection<ComboboxOption>({
      items: local.options.filter((option) => filters().contains(option.label, search.term)),
    }),
  )
  return (
    <Combobox.Root
      class={`${ROOT}  ${local.class ?? ''}`}
      collection={collection()}
      value={local.value === undefined ? [] : [local.value]}
      onValueChange={(details) => {
        const [next] = details.value
        if (next !== undefined) local.onValueChange?.(next)
      }}
      onInputValueChange={(details) => setSearch('term', details.inputValue)}
      onOpenChange={(details) => {
        if (details.open) setSearch('term', '')
      }}
      openOnClick
      inputBehavior="autohighlight"
      disabled={local.disabled ?? field?.().disabled}
      readOnly={local.readOnly ?? field?.().readOnly}
      invalid={local.invalid ?? field?.().invalid}
      positioning={{strategy: 'fixed', placement: 'bottom-start', gutter: 4}}
    >
      <Combobox.Control class={CONTROL}>
        <Combobox.Input class={INPUT} placeholder={local.placeholder} />
        <Combobox.Trigger class={TRIGGER}>
          <ChevronsUpDown class="size-3.5" aria-hidden="true" />
        </Combobox.Trigger>
      </Combobox.Control>
      <Combobox.Positioner>
        <Combobox.Content class={CONTENT}>
          <Combobox.Empty class={EMPTY}>{local.emptyText ?? 'No matches'}</Combobox.Empty>
          <For each={collection().items}>
            {(item) => (
              <Combobox.Item item={item} class={ITEM}>
                <Combobox.ItemText>{item.label}</Combobox.ItemText>
                <span class="inline-flex gap-2 items-center">
                  <Show when={item.meta}>{(meta) => <span class={META}>{meta()}</span>}</Show>
                  <Combobox.ItemIndicator>
                    <Check class="text-chat-accent size-3.5" aria-hidden="true" />
                  </Combobox.ItemIndicator>
                </span>
              </Combobox.Item>
            )}
          </For>
        </Combobox.Content>
      </Combobox.Positioner>
    </Combobox.Root>
  )
}
