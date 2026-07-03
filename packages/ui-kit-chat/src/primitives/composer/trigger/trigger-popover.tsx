import {
  createContext,
  createMemo,
  createSignal,
  onCleanup,
  Show,
  splitProps,
  useContext,
  type Accessor,
  type JSX,
  type ParentProps,
} from 'solid-js'
import {DEV} from 'solid-js'
import {useComposer} from '../../../store/chat-context.js'
import {Primitive} from '../../util/primitive.js'
import {defaultDirectiveFormatter} from './directive-formatter.js'
import {createTriggerPopoverModel, type TriggerPopoverScope} from './trigger-popover-model.js'
import type {DirectiveFormatter, TriggerAdapter, TriggerCategory, TriggerItem} from './types.js'

type ActiveAria = {popoverId: string; highlightedItemId: string | undefined}

type RootContextValue = {
  register(scope: TriggerPopoverScope): () => void
  triggers: Accessor<readonly TriggerPopoverScope[]>
  activeAria: Accessor<ActiveAria | null>
}

const RootContext = createContext<RootContextValue>()

export function useTriggerPopoverRootOptional(): RootContextValue | undefined {
  return useContext(RootContext)
}

const ScopeContext = createContext<TriggerPopoverScope>()

export function useTriggerPopoverScope(): TriggerPopoverScope {
  const scope = useContext(ScopeContext)
  if (!scope) throw new Error('TriggerPopover.* must be used within a Composer.TriggerPopover')
  return scope
}

function warnOnCollision(existing: readonly TriggerPopoverScope[], char: string): void {
  if (!DEV) return
  for (const scope of existing) {
    if (scope.char === char) console.warn(`[ui-kit-chat] Duplicate TriggerPopover for char "${char}".`)
    if (scope.char !== char && (char.startsWith(scope.char) || scope.char.startsWith(char)))
      console.warn(`[ui-kit-chat] Trigger prefix collision between "${scope.char}" and "${char}".`)
  }
}

function Root(props: ParentProps): JSX.Element {
  const [triggers, setTriggers] = createSignal<readonly TriggerPopoverScope[]>([])
  const activeAria = createMemo<ActiveAria | null>(() => {
    const openScope = triggers().find((scope) => scope.open())
    return openScope ? {popoverId: openScope.popoverId, highlightedItemId: openScope.highlightedItemId()} : null
  })
  const value: RootContextValue = {
    register: (scope) => {
      warnOnCollision(triggers(), scope.char)
      setTriggers((previous) => [...previous, scope])
      return () => setTriggers((previous) => previous.filter((entry) => entry !== scope))
    },
    triggers,
    activeAria,
  }
  return <RootContext.Provider value={value}>{props.children}</RootContext.Provider>
}

type TriggerPopoverProps = JSX.HTMLAttributes<HTMLDivElement> & {
  char: string
  adapter?: TriggerAdapter
  isLoading?: boolean
}

function TriggerPopoverComponent(props: TriggerPopoverProps): JSX.Element {
  const composer = useComposer()
  const root = useContext(RootContext)
  if (!root) throw new Error('Composer.TriggerPopover must be used within a Composer.TriggerPopoverRoot')
  const [local, rest] = splitProps(props, ['char', 'adapter', 'isLoading', 'children'])
  const scope = createTriggerPopoverModel({
    char: local.char,
    adapter: () => local.adapter,
    isLoading: () => local.isLoading ?? false,
    text: composer.text,
    setText: composer.setText,
  })
  onCleanup(root.register(scope))
  return (
    <ScopeContext.Provider value={scope}>
      <Show when={scope.open()} fallback={local.children}>
        <Primitive.div
          role="listbox"
          id={scope.popoverId}
          aria-label="Suggestions"
          aria-activedescendant={scope.highlightedItemId()}
          data-state="open"
          {...rest}
        >
          {local.children}
        </Primitive.div>
      </Show>
    </ScopeContext.Provider>
  )
}

function Directive(props: {formatter?: DirectiveFormatter; onInserted?: (item: TriggerItem) => void}): JSX.Element {
  const scope = useTriggerPopoverScope()
  onCleanup(
    scope.registerBehavior({
      kind: 'directive',
      formatter: () => props.formatter ?? defaultDirectiveFormatter,
      onInserted: (item) => props.onInserted?.(item),
    }),
  )
  return <></>
}

function Action(props: {
  formatter?: DirectiveFormatter
  onExecute: (item: TriggerItem) => void
  removeOnExecute?: boolean
}): JSX.Element {
  const scope = useTriggerPopoverScope()
  onCleanup(
    scope.registerBehavior({
      kind: 'action',
      formatter: () => props.formatter ?? defaultDirectiveFormatter,
      onExecute: (item) => props.onExecute(item),
      removeOnExecute: () => props.removeOnExecute ?? false,
    }),
  )
  return <></>
}

type CategoriesProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, 'children'> & {
  children: (categories: Accessor<readonly TriggerCategory[]>) => JSX.Element
}

function Categories(props: CategoriesProps): JSX.Element {
  const scope = useTriggerPopoverScope()
  const [local, rest] = splitProps(props, ['children'])
  const visible = () => scope.open() && !scope.activeCategoryId() && !scope.isSearchMode()
  return (
    <Show when={visible()}>
      <Primitive.div role="group" aria-label="Categories" {...rest}>
        {local.children(scope.categories)}
      </Primitive.div>
    </Show>
  )
}

type CategoryItemProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {categoryId: string}

function CategoryItem(props: CategoryItemProps): JSX.Element {
  const scope = useTriggerPopoverScope()
  const [local, rest] = splitProps(props, ['categoryId', 'onClick', 'onMouseMove'])
  const index = () => scope.categories().findIndex((category) => category.id === local.categoryId)
  const highlighted = () => !scope.isSearchMode() && !scope.activeCategoryId() && index() === scope.highlightedIndex()
  return (
    <Primitive.button
      type="button"
      role="option"
      id={`${scope.popoverId}-option-${local.categoryId}`}
      aria-selected={highlighted()}
      data-highlighted={highlighted() ? '' : undefined}
      onClick={(event) => {
        if (typeof local.onClick === 'function') local.onClick(event)
        scope.selectCategory(local.categoryId)
      }}
      onMouseMove={(event) => {
        if (typeof local.onMouseMove === 'function') local.onMouseMove(event)
        scope.highlightIndex(index())
      }}
      {...rest}
    />
  )
}

type ItemsProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, 'children'> & {
  children: (items: Accessor<readonly TriggerItem[]>) => JSX.Element
}

function Items(props: ItemsProps): JSX.Element {
  const scope = useTriggerPopoverScope()
  const [local, rest] = splitProps(props, ['children'])
  const visible = () => scope.open() && (scope.activeCategoryId() !== null || scope.isSearchMode())
  return (
    <Show when={visible()}>
      <Primitive.div role="group" aria-label="Items" {...rest}>
        {local.children(scope.items)}
      </Primitive.div>
    </Show>
  )
}

type ItemProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {item: TriggerItem; index?: number}

function Item(props: ItemProps): JSX.Element {
  const scope = useTriggerPopoverScope()
  const [local, rest] = splitProps(props, ['item', 'index', 'onClick', 'onMouseMove'])
  const index = () => local.index ?? scope.items().findIndex((entry) => entry.id === local.item.id)
  const highlighted = () =>
    (scope.isSearchMode() || scope.activeCategoryId() !== null) && index() === scope.highlightedIndex()
  return (
    <Primitive.button
      type="button"
      role="option"
      id={`${scope.popoverId}-option-${local.item.id}`}
      aria-selected={highlighted()}
      data-highlighted={highlighted() ? '' : undefined}
      onClick={(event) => {
        if (typeof local.onClick === 'function') local.onClick(event)
        scope.selectItem(local.item)
      }}
      onMouseMove={(event) => {
        if (typeof local.onMouseMove === 'function') local.onMouseMove(event)
        scope.highlightIndex(index())
      }}
      {...rest}
    />
  )
}

function Back(props: JSX.ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  const scope = useTriggerPopoverScope()
  const [local, rest] = splitProps(props, ['onClick'])
  const visible = () => scope.open() && scope.activeCategoryId() !== null && !scope.isSearchMode()
  return (
    <Show when={visible()}>
      <Primitive.button
        type="button"
        onClick={(event) => {
          if (typeof local.onClick === 'function') local.onClick(event)
          scope.goBack()
        }}
        {...rest}
      />
    </Show>
  )
}

export const TriggerPopover = Object.assign(TriggerPopoverComponent, {Directive, Action})
export const TriggerPopoverRoot = Root
export const TriggerPopoverCategories = Categories
export const TriggerPopoverCategoryItem = CategoryItem
export const TriggerPopoverItems = Items
export const TriggerPopoverItem = Item
export const TriggerPopoverBack = Back
