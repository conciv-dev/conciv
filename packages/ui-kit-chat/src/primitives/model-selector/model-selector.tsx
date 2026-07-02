import {
  createContext,
  createSignal,
  For,
  Show,
  splitProps,
  useContext,
  type Accessor,
  type JSX,
  type ParentProps,
} from 'solid-js'
import {Combobox} from '@conciv/ui-kit-system'
import {useListCollection} from '@ark-ui/solid/combobox'
import {createControllableSignal} from '../util/create-controllable-signal.js'

export type ModelSelectorEffortOption = {id: string; name: string}

export const DEFAULT_EFFORT_OPTIONS: readonly ModelSelectorEffortOption[] = [
  {id: 'low', name: 'Low'},
  {id: 'medium', name: 'Medium'},
  {id: 'high', name: 'High'},
]

export type ModelOption = {
  id: string
  name: string
  description?: string
  icon?: JSX.Element
  disabled?: boolean
  keywords?: readonly string[]
  efforts?: boolean | readonly ModelSelectorEffortOption[]
}

function getModelEfforts(model: ModelOption | undefined): readonly ModelSelectorEffortOption[] | undefined {
  if (!model?.efforts) return undefined
  return model.efforts === true ? DEFAULT_EFFORT_OPTIONS : model.efforts
}

function resolveEffort(
  efforts: readonly ModelSelectorEffortOption[] | undefined,
  effort: string | undefined,
): string | undefined {
  if (effort === undefined) return undefined
  return efforts?.some((option) => option.id === effort) ? effort : undefined
}

export function resolveModelEffort(
  models: readonly ModelOption[],
  modelId: string | undefined,
  effort: string | undefined,
): string | undefined {
  return resolveEffort(getModelEfforts(models.find((model) => model.id === modelId)), effort)
}

function matches(model: ModelOption, query: string): boolean {
  if (!query) return true
  return `${model.name} ${model.id} ${(model.keywords ?? []).join(' ')}`.toLowerCase().includes(query.toLowerCase())
}

type ModelSelectorContextValue = {
  models: Accessor<readonly ModelOption[]>
  filteredModels: Accessor<readonly ModelOption[]>
  value: Accessor<string | undefined>
  setValue: (value: string) => void
  selectedModel: Accessor<ModelOption | undefined>
  efforts: Accessor<readonly ModelSelectorEffortOption[] | undefined>
  effort: Accessor<string | undefined>
  setEffort: (effort: string) => void
  setOpen: (open: boolean) => void
}

const ModelSelectorContext = createContext<ModelSelectorContextValue>()

export function useModelSelectorContext(): ModelSelectorContextValue {
  const context = useContext(ModelSelectorContext)
  if (!context) throw new Error('ModelSelector sub-components must be used within ModelSelector.Root')
  return context
}

export function useModelSelectorEfforts(): {
  efforts: Accessor<readonly ModelSelectorEffortOption[] | undefined>
  effort: Accessor<string | undefined>
  setEffort: (effort: string) => void
} {
  const {efforts, effort, setEffort} = useModelSelectorContext()
  return {efforts, effort, setEffort}
}

export type ModelSelectorRootProps = ParentProps<{
  models: readonly ModelOption[]
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  effort?: string
  defaultEffort?: string
  onEffortChange?: (effort: string) => void
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}>

function Root(props: ModelSelectorRootProps): JSX.Element {
  const {collection, filter} = useListCollection<ModelOption>({
    initialItems: props.models.slice(),
    filter: (_text, query, item) => matches(item, query),
    itemToValue: (model) => model.id,
    itemToString: (model) => model.name,
    isItemDisabled: (model) => Boolean(model.disabled),
  })
  const [value, setValue] = createControllableSignal<string>({
    value: () => props.value,
    defaultValue: () => props.defaultValue ?? props.models[0]?.id,
    onChange: (next) => props.onValueChange?.(next),
  })
  const [effort, setEffort] = createControllableSignal<string>({
    value: () => props.effort,
    defaultValue: () => props.defaultEffort,
    onChange: (next) => props.onEffortChange?.(next),
  })
  const [open, setOpen] = createControllableSignal<boolean>({
    value: () => props.open,
    defaultValue: () => props.defaultOpen ?? false,
    onChange: (next) => props.onOpenChange?.(next),
  })
  const [query, setQuery] = createSignal('')
  const resetSearch = () => {
    setQuery('')
    filter('')
  }
  const selectedModel = () => props.models.find((model) => model.id === value())
  const efforts = () => getModelEfforts(selectedModel())
  const activeEffort = () => resolveEffort(efforts(), effort())
  const selection = () => {
    const current = value()
    return current ? [current] : []
  }
  return (
    <ModelSelectorContext.Provider
      value={{
        models: () => props.models,
        filteredModels: () => collection().items,
        value,
        setValue,
        selectedModel,
        efforts,
        effort: activeEffort,
        setEffort,
        setOpen: (next) => setOpen(next),
      }}
    >
      <Combobox.Root
        collection={collection()}
        value={selection()}
        inputValue={query()}
        open={open() ?? false}
        onValueChange={(details) => {
          const id = details.value[0]
          if (id) setValue(id)
          resetSearch()
          setOpen(false)
        }}
        onInputValueChange={(details) => {
          setQuery(details.inputValue)
          filter(details.inputValue)
        }}
        onOpenChange={(details) => {
          setOpen(details.open)
          if (details.open) resetSearch()
        }}
        openOnClick
        selectionBehavior="clear"
        positioning={{strategy: 'fixed', placement: 'top-start', gutter: 6}}
      >
        {props.children}
      </Combobox.Root>
    </ModelSelectorContext.Provider>
  )
}

export type ModelSelectorTriggerProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'outline' | 'ghost' | 'muted'
  size?: 'default' | 'sm' | 'lg'
}

function Trigger(props: ModelSelectorTriggerProps): JSX.Element {
  const [local, rest] = splitProps(props, ['variant', 'size', 'children'])
  return (
    <Combobox.Control class="inline-flex">
      <Combobox.Trigger data-variant={local.variant ?? 'outline'} data-size={local.size ?? 'default'} {...rest}>
        <Show when={local.children} fallback={<Value />}>
          {local.children}
        </Show>
      </Combobox.Trigger>
    </Combobox.Control>
  )
}

export type ModelSelectorValueProps = {placeholder?: JSX.Element; showEffort?: boolean; class?: string}

function Value(props: ModelSelectorValueProps): JSX.Element {
  const context = useModelSelectorContext()
  const effortName = () => {
    if (props.showEffort === false) return undefined
    const current = context.effort()
    return current === undefined ? undefined : context.efforts()?.find((option) => option.id === current)?.name
  }
  return (
    <Show
      when={context.selectedModel()}
      fallback={<span class={props.class}>{props.placeholder ?? 'Select model'}</span>}
    >
      {(model) => (
        <span class={props.class}>
          {model().icon}
          <span data-model-name>{model().name}</span>
          <Show when={effortName()}>{(name) => <span data-model-effort>{name()}</span>}</Show>
        </span>
      )}
    </Show>
  )
}

export type ModelSelectorContentProps = JSX.HTMLAttributes<HTMLDivElement>

function Content(props: ModelSelectorContentProps): JSX.Element {
  return (
    <Combobox.Positioner>
      <Combobox.Content {...props} />
    </Combobox.Positioner>
  )
}

export type ModelSelectorSearchProps = JSX.InputHTMLAttributes<HTMLInputElement> & {placeholder?: string}

function Search(props: ModelSelectorSearchProps): JSX.Element {
  return <Combobox.Input placeholder={props.placeholder ?? 'Search models…'} {...props} />
}

export type ModelSelectorListProps = ParentProps<JSX.HTMLAttributes<HTMLDivElement>>

function List(props: ModelSelectorListProps): JSX.Element {
  const context = useModelSelectorContext()
  const [local, rest] = splitProps(props, ['children'])
  return (
    <div {...rest}>
      <Show
        when={local.children}
        fallback={<For each={context.filteredModels()}>{(model) => <Item model={model} />}</For>}
      >
        {local.children}
      </Show>
    </div>
  )
}

export type ModelSelectorEmptyProps = ParentProps<JSX.HTMLAttributes<HTMLDivElement>>

function Empty(props: ModelSelectorEmptyProps): JSX.Element {
  const context = useModelSelectorContext()
  const [local, rest] = splitProps(props, ['children'])
  return (
    <Show when={context.filteredModels().length === 0}>
      <div {...rest}>{local.children ?? 'No models found.'}</div>
    </Show>
  )
}

export type ModelSelectorGroupProps = JSX.HTMLAttributes<HTMLDivElement>

function Group(props: ModelSelectorGroupProps): JSX.Element {
  return <Combobox.ItemGroup {...props} />
}

export type ModelSelectorSeparatorProps = JSX.HTMLAttributes<HTMLDivElement>

function Separator(props: ModelSelectorSeparatorProps): JSX.Element {
  return <div role="separator" {...props} />
}

export type ModelSelectorItemProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, 'onSelect'> & {
  model: ModelOption
  onSelect?: (value: string) => void
}

function Item(props: ModelSelectorItemProps): JSX.Element {
  const [local, rest] = splitProps(props, ['model', 'onSelect', 'children'])
  return (
    <Combobox.Item item={local.model} {...rest}>
      <Show when={local.children} fallback={<Combobox.ItemText>{local.model.name}</Combobox.ItemText>}>
        {local.children}
      </Show>
    </Combobox.Item>
  )
}

export type ModelSelectorEffortProps = JSX.HTMLAttributes<HTMLDivElement> & {label?: JSX.Element}

function Effort(props: ModelSelectorEffortProps): JSX.Element {
  const context = useModelSelectorContext()
  const [local, rest] = splitProps(props, ['label', 'onKeyDown'])
  return (
    <Show when={context.efforts()?.length}>
      <div
        role="group"
        aria-label="Reasoning effort"
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.stopPropagation()
          if (typeof local.onKeyDown === 'function') local.onKeyDown(event)
        }}
        {...rest}
      >
        <span data-effort-label>{local.label ?? 'Thinking'}</span>
        <For each={context.efforts()}>
          {(option) => (
            <button
              type="button"
              aria-pressed={option.id === context.effort()}
              data-state={option.id === context.effort() ? 'on' : 'off'}
              onClick={() => context.setEffort(option.id)}
            >
              {option.name}
            </button>
          )}
        </For>
      </div>
    </Show>
  )
}

export const ModelSelector = Object.assign(Root, {
  Root,
  Trigger,
  Value,
  Content,
  Search,
  List,
  Empty,
  Group,
  Separator,
  Item,
  Effort,
})
