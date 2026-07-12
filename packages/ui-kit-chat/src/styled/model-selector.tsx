import {For, Show, splitProps, type JSX} from 'solid-js'
import {Combobox} from '@conciv/ui-kit-system'
import {Check, ChevronsUpDown} from 'lucide-solid'
import {
  ModelSelector as ModelSelectorPrimitive,
  useModelSelectorContext,
  useModelSelectorEfforts,
  type ModelOption,
  type ModelSelectorRootProps,
  type ModelSelectorValueProps,
} from '../primitives/model-selector/model-selector.js'

const TRIGGER =
  'text-[length:var(--chat-text-sm)] [color:var(--chat-text-2)] pl-2.5 pr-[0.4375rem] h-7 max-w-42 gap-1 inline-flex items-center cursor-pointer rounded-[var(--chat-radius-pill)] [background:var(--chat-fill)] [border:1px_solid_var(--chat-line)] [transition:color_120ms_var(--chat-ease),border-color_120ms_var(--chat-ease),background-color_120ms_var(--chat-ease)] hover:[color:var(--chat-text-hi)] hover:[background:var(--chat-fill-strong)]'
const VALUE =
  'min-w-0 inline-flex items-center gap-1.5 [&_[data-model-name]]:truncate [&_[data-model-effort]]:[color:var(--chat-text-3)]'
const CONTENT =
  'p-1 w-64 max-h-80 flex-col hidden z-10 rounded-[var(--chat-radius-md)] [background:var(--chat-panel)] [border:1px_solid_var(--chat-line)] [box-shadow:var(--chat-shadow-lg)] focus-visible:outline-none data-[state=open]:flex'
const SEARCH =
  'h-8 w-full mb-1 px-2 text-[length:var(--chat-text-md)] [color:var(--chat-text)] [background:transparent] [border:none] [border-bottom:1px_solid_var(--chat-line-soft)] rounded-none placeholder:[color:var(--chat-text-3)] focus:outline-none'
const LIST = 'flex-1 overflow-y-auto'
const EMPTY = 'text-[length:var(--chat-text-sm)] [color:var(--chat-text-3)] px-2 py-2.5'
const ITEM =
  '[color:var(--chat-text)] px-2 py-[0.4375rem] gap-2 flex items-center cursor-pointer rounded-[var(--chat-radius-sm)] data-[disabled]:[color:var(--chat-text-3)] data-[disabled]:cursor-not-allowed data-[highlighted]:[color:var(--chat-text-hi)] data-[highlighted]:[background:var(--chat-fill-strong)]'
const ITEM_BODY = 'flex flex-1 flex-col gap-px min-w-0'
const ITEM_DESC = 'text-[length:var(--chat-text-xs)] [color:var(--chat-text-3)]'
const INDICATOR = '[color:var(--chat-accent)] ml-auto hidden data-[state=checked]:inline-flex'
const GROUP_LABEL =
  'text-[length:var(--chat-text-xs)] [color:var(--chat-text-3)] tracking-[0.02em] font-semibold px-2 pb-0.5 pt-1.5 uppercase'
const EFFORT_ROW = 'flex items-center justify-between gap-3 mt-1 px-2 py-2 [border-top:1px_solid_var(--chat-line-soft)]'
const EFFORT_LABEL = 'text-[length:var(--chat-text-xs)] [color:var(--chat-text-3)]'
const EFFORT_GROUP = 'flex items-center gap-0.5'
const EFFORT_BTN =
  'px-2 py-1 text-[length:var(--chat-text-xs)] rounded-[var(--chat-radius-sm)] cursor-pointer [border:none] [background:transparent] [transition:color_120ms_var(--chat-ease),background-color_120ms_var(--chat-ease)]'
const EFFORT_ON = '[color:var(--chat-text-hi)] [background:var(--chat-fill-strong)] font-medium'
const EFFORT_OFF = '[color:var(--chat-text-3)] hover:[color:var(--chat-text)]'

export type StyledModelSelectorProps = Omit<ModelSelectorRootProps, 'children'> & {
  searchable?: boolean
  class?: string
  contentClass?: string
  variant?: 'outline' | 'ghost' | 'muted'
  size?: 'default' | 'sm' | 'lg'
}

function Value(props: ModelSelectorValueProps): JSX.Element {
  return <ModelSelectorPrimitive.Value {...props} class={`${VALUE}  ${props.class ?? ''}`} />
}

function Trigger(
  props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'outline' | 'ghost' | 'muted'
    size?: 'default' | 'sm' | 'lg'
  },
): JSX.Element {
  const [local, rest] = splitProps(props, ['class', 'children'])
  return (
    <ModelSelectorPrimitive.Trigger
      class={`${TRIGGER}  ${local.class ?? ''}`}
      aria-label="Select model"
      title="Select model"
      {...rest}
    >
      <Show
        when={local.children}
        fallback={
          <>
            <Value />
            <ChevronsUpDown size={13} class="opacity-70 shrink-0" aria-hidden="true" />
          </>
        }
      >
        {local.children}
      </Show>
    </ModelSelectorPrimitive.Trigger>
  )
}

function Content(props: JSX.HTMLAttributes<HTMLDivElement>): JSX.Element {
  const [local, rest] = splitProps(props, ['class'])
  return <ModelSelectorPrimitive.Content class={`${CONTENT}  ${local.class ?? ''}`} {...rest} />
}

function Search(props: JSX.InputHTMLAttributes<HTMLInputElement> & {placeholder?: string}): JSX.Element {
  const [local, rest] = splitProps(props, ['class'])
  return <ModelSelectorPrimitive.Search class={`${SEARCH}  ${local.class ?? ''}`} {...rest} />
}

function Item(props: {model: ModelOption}): JSX.Element {
  return (
    <ModelSelectorPrimitive.Item model={props.model} class={ITEM}>
      <div class={ITEM_BODY}>
        <Combobox.ItemText>{props.model.name}</Combobox.ItemText>
        <Show when={props.model.description}>
          <span class={ITEM_DESC}>{props.model.description}</span>
        </Show>
      </div>
      <Combobox.ItemIndicator class={INDICATOR}>
        <Check size={15} aria-hidden="true" />
      </Combobox.ItemIndicator>
    </ModelSelectorPrimitive.Item>
  )
}

function List(): JSX.Element {
  const context = useModelSelectorContext()
  return (
    <ModelSelectorPrimitive.List class={LIST}>
      <Show when={context.filteredModels().length === 0}>
        <div class={EMPTY}>No models match</div>
      </Show>
      <For each={context.filteredModels()}>{(model) => <Item model={model} />}</For>
    </ModelSelectorPrimitive.List>
  )
}

function Group(props: JSX.HTMLAttributes<HTMLDivElement> & {label?: JSX.Element}): JSX.Element {
  const [local, rest] = splitProps(props, ['label', 'children'])
  return (
    <ModelSelectorPrimitive.Group {...rest}>
      <Show when={local.label}>
        <Combobox.ItemGroupLabel class={GROUP_LABEL}>{local.label}</Combobox.ItemGroupLabel>
      </Show>
      {local.children}
    </ModelSelectorPrimitive.Group>
  )
}

function Effort(props: {label?: JSX.Element}): JSX.Element {
  const {efforts, effort, setEffort} = useModelSelectorEfforts()
  return (
    <Show when={efforts()?.length}>
      <div
        role="group"
        aria-label="Reasoning effort"
        class={EFFORT_ROW}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.stopPropagation()
        }}
      >
        <span class={EFFORT_LABEL}>{props.label ?? 'Thinking'}</span>
        <div class={EFFORT_GROUP}>
          <For each={efforts()}>
            {(option) => (
              <button
                type="button"
                aria-pressed={option.id === effort()}
                class={`${EFFORT_BTN}  ${option.id === effort() ? EFFORT_ON : EFFORT_OFF}`}
                onClick={() => setEffort(option.id)}
              >
                {option.name}
              </button>
            )}
          </For>
        </div>
      </div>
    </Show>
  )
}

function StyledModelSelector(props: StyledModelSelectorProps): JSX.Element {
  const [local, rest] = splitProps(props, ['searchable', 'class', 'contentClass', 'variant', 'size'])
  return (
    <ModelSelectorPrimitive.Root {...rest}>
      <Trigger variant={local.variant} size={local.size} class={local.class} />
      <Content class={local.contentClass}>
        <Show when={local.searchable}>
          <Search />
        </Show>
        <List />
        <Effort />
      </Content>
    </ModelSelectorPrimitive.Root>
  )
}

export const ModelSelector = Object.assign(StyledModelSelector, {
  Root: ModelSelectorPrimitive.Root,
  Trigger,
  Value,
  Content,
  Search,
  List,
  Item,
  Group,
  Separator: ModelSelectorPrimitive.Separator,
  Effort,
})
