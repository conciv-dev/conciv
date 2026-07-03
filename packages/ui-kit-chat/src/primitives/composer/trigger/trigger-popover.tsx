import {
  children,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  on,
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
import type {DirectiveFormatter, TriggerAdapter, TriggerBehavior, TriggerCategory, TriggerItem} from './types.js'

export type RegisteredTrigger = {
  readonly char: string
  readonly scope: TriggerPopoverScope
}

type ActiveAria = {popoverId: string; highlightedItemId: string | undefined}

type RootContextValue = {
  register(trigger: RegisteredTrigger): () => void
  triggers: Accessor<readonly RegisteredTrigger[]>
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

export type TriggerBehaviorRegistration = {
  register(behavior: TriggerBehavior): () => void
}

const TriggerBehaviorRegistrationContext = createContext<TriggerBehaviorRegistration>()

export function useTriggerBehaviorRegistration(): TriggerBehaviorRegistration {
  const registration = useContext(TriggerBehaviorRegistrationContext)
  if (!registration)
    throw new Error('TriggerPopover.Directive / TriggerPopover.Action must be rendered inside Composer.TriggerPopover')
  return registration
}

function Root(props: ParentProps): JSX.Element {
  const [triggers, setTriggers] = createSignal<readonly RegisteredTrigger[]>([])
  const activeAria = createMemo<ActiveAria | null>(() => {
    const openTrigger = triggers().find((trigger) => trigger.scope.open())
    return openTrigger
      ? {popoverId: openTrigger.scope.popoverId, highlightedItemId: openTrigger.scope.highlightedItemId()}
      : null
  })
  const register = (trigger: RegisteredTrigger) => {
    const existing = triggers()
    if (existing.some((entry) => entry.char === trigger.char)) {
      if (DEV)
        console.warn(
          `[ui-kit-chat] Duplicate TriggerPopover for char "${trigger.char}". Ignoring the second registration.`,
        )
      return () => {}
    }
    if (DEV) {
      for (const entry of existing) {
        if (trigger.char.startsWith(entry.char) || entry.char.startsWith(trigger.char))
          console.warn(
            `[ui-kit-chat] Trigger prefix collision between "${entry.char}" and "${trigger.char}". One char is a prefix of the other; only one will match reliably.`,
          )
      }
    }
    setTriggers((previous) => [...previous, trigger])
    return () => setTriggers((previous) => previous.filter((entry) => entry !== trigger))
  }
  return <RootContext.Provider value={{register, triggers, activeAria}}>{props.children}</RootContext.Provider>
}

type TriggerPopoverProps = JSX.HTMLAttributes<HTMLDivElement> & {
  char: string
  adapter?: TriggerAdapter
  isLoading?: boolean
}

function TriggerPopoverBody(
  props: Omit<JSX.HTMLAttributes<HTMLDivElement>, 'children'> & {scope: TriggerPopoverScope; children: JSX.Element},
): JSX.Element {
  const [local, rest] = splitProps(props, ['scope', 'children'])
  const resolved = children(() => local.children)
  let listbox: HTMLDivElement | undefined
  createEffect(() => {
    const id = local.scope.highlightedItemId()
    if (id) listbox?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({block: 'nearest'})
  })
  return (
    <Show when={local.scope.open()} fallback={resolved()}>
      <Primitive.div
        ref={(node: HTMLDivElement) => (listbox = node)}
        role="listbox"
        id={local.scope.popoverId}
        aria-label="Suggestions"
        aria-activedescendant={local.scope.highlightedItemId()}
        data-state="open"
        {...rest}
      >
        {resolved()}
      </Primitive.div>
    </Show>
  )
}

function TriggerPopoverComponent(props: TriggerPopoverProps): JSX.Element {
  const composer = useComposer()
  const root = useContext(RootContext)
  if (!root) throw new Error('Composer.TriggerPopover must be used within a Composer.TriggerPopoverRoot')
  const [local, rest] = splitProps(props, ['char', 'adapter', 'isLoading', 'children'])
  const popoverId = createUniqueId()

  const [behavior, setBehavior] = createSignal<TriggerBehavior | null>(null)
  let registrationCount = 0
  const registration: TriggerBehaviorRegistration = {
    register: (next) => {
      registrationCount += 1
      if (DEV && registrationCount > 1)
        console.warn(
          `[ui-kit-chat] TriggerPopover "${local.char}" received more than one behavior child. Exactly one <TriggerPopover.Directive> or <TriggerPopover.Action> is allowed per TriggerPopover; the last registration wins.`,
        )
      setBehavior(() => next)
      return () => {
        registrationCount = Math.max(0, registrationCount - 1)
        setBehavior((current) => (current === next ? null : current))
      }
    },
  }

  const scope = createTriggerPopoverModel({
    char: local.char,
    adapter: () => local.adapter,
    behavior: () => behavior() ?? undefined,
    isLoading: () => local.isLoading ?? false,
    popoverId,
    text: composer.text,
    setText: composer.setText,
  })
  onCleanup(root.register({char: local.char, scope}))

  return (
    <TriggerBehaviorRegistrationContext.Provider value={registration}>
      <ScopeContext.Provider value={scope}>
        <TriggerPopoverBody scope={scope} {...rest}>
          {local.children}
        </TriggerPopoverBody>
      </ScopeContext.Provider>
    </TriggerBehaviorRegistrationContext.Provider>
  )
}

function Directive(props: {formatter?: DirectiveFormatter; onInserted?: (item: TriggerItem) => void}): JSX.Element {
  const registration = useTriggerBehaviorRegistration()
  createEffect(
    on(
      () => props.formatter,
      (formatter) => {
        onCleanup(
          registration.register({
            kind: 'directive',
            formatter: formatter ?? defaultDirectiveFormatter,
            onInserted: (item) => props.onInserted?.(item),
          }),
        )
      },
    ),
  )
  return <></>
}

function Action(props: {
  formatter?: DirectiveFormatter
  onExecute: (item: TriggerItem) => void
  removeOnExecute?: boolean
}): JSX.Element {
  const registration = useTriggerBehaviorRegistration()
  createEffect(
    on([() => props.formatter, () => props.removeOnExecute], ([formatter, removeOnExecute]) => {
      onCleanup(
        registration.register({
          kind: 'action',
          formatter: formatter ?? defaultDirectiveFormatter,
          onExecute: (item) => props.onExecute(item),
          ...(removeOnExecute === undefined ? {} : {removeOnExecute}),
        }),
      )
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
  const categoryIndex = () => scope.categories().findIndex((category) => category.id === local.categoryId)
  const highlighted = () =>
    !scope.activeCategoryId() && !scope.isSearchMode() && categoryIndex() === scope.highlightedIndex()
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
        scope.highlightIndex(categoryIndex())
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
  const itemIndex = () => local.index ?? scope.items().findIndex((entry) => entry.id === local.item.id)
  const highlighted = () =>
    (scope.isSearchMode() || scope.activeCategoryId() !== null) && itemIndex() === scope.highlightedIndex()
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
        scope.highlightIndex(itemIndex())
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
