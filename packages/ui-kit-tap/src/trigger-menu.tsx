import {Show, createMemo, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {
  AnchoredListbox,
  Button,
  type AnchoredListboxGroup,
  type AnchoredListboxHandle,
  type AnchoredListboxOption,
} from '@conciv/ui-kit-system'
import {
  triggerStatusMessage,
  type RichTextFieldTriggerItem,
  type TriggerDispatchState,
  type TriggerMenuAccess,
  type TriggerMenuState,
} from './trigger-suggestions.js'

type MenuAction = {kind: 'item'; item: RichTextFieldTriggerItem} | {kind: 'category'; categoryId: string}

const BACK = 'w-full gap-1.5 min-h-11 px-2.5 text-[0.8125rem] text-pw-text-2'
const BACK_LABEL = 'flex-1 text-start truncate'

export type TriggerMenuController = {
  state: () => TriggerMenuState | null
  access: TriggerMenuAccess
  setListbox: (handle: AnchoredListboxHandle | null) => void
}

export function createTriggerMenu(): TriggerMenuController {
  const [store, setStore] = createStore<{active: TriggerMenuState | null; listbox: AnchoredListboxHandle | null}>({
    active: null,
    listbox: null,
  })
  const state = () => store.active
  const access: TriggerMenuAccess = {
    state,
    open: (dispatch: TriggerDispatchState) => {
      const current = store.active
      const categoryId = current?.dispatch.char === dispatch.char ? current.categoryId : null
      setStore('active', {dispatch, categoryId})
    },
    close: (char: string) => {
      if (store.active?.dispatch.char !== char) return
      setStore('active', null)
    },
    enterCategory: (categoryId: string) => setStore('active', 'categoryId', categoryId),
    leaveCategory: () => setStore('active', 'categoryId', null),
    listbox: () => store.listbox,
  }
  return {state, access, setListbox: (handle) => setStore('listbox', handle)}
}

function itemOption(item: RichTextFieldTriggerItem): AnchoredListboxOption {
  return {value: `item:${item.id}`, label: item.label, description: item.description}
}

const groupKey = (item: RichTextFieldTriggerItem): string => item.group ?? ''

function groupLabel(key: string): string | undefined {
  if (key === '') return undefined
  return key
}

function bucketItems(items: readonly RichTextFieldTriggerItem[]): Map<string, AnchoredListboxOption[]> {
  const buckets = new Map<string, AnchoredListboxOption[]>()
  for (const item of items) {
    const bucket = buckets.get(groupKey(item)) ?? []
    bucket.push(itemOption(item))
    buckets.set(groupKey(item), bucket)
  }
  return buckets
}

function itemGroups(items: readonly RichTextFieldTriggerItem[]): AnchoredListboxGroup[] {
  return Array.from(bucketItems(items), ([key, options], position) => ({
    id: `group-${position}`,
    label: groupLabel(key),
    options,
  }))
}

export function TriggerMenu(props: {
  state: TriggerMenuState
  onEnterCategory: (categoryId: string) => void
  onLeaveCategory: () => void
  onDismiss: () => void
  onRefocus: () => void
  onListbox: (handle: AnchoredListboxHandle | null) => void
}): JSX.Element {
  const dispatch = () => props.state.dispatch
  const activeCategory = () =>
    dispatch().categories.find((category) => category.id === props.state.categoryId) ?? undefined
  const showsCategories = () =>
    props.state.categoryId === null && dispatch().categories.length > 0 && dispatch().query === ''
  const visibleItems = () => {
    const categoryId = props.state.categoryId
    if (categoryId === null) return dispatch().items
    return dispatch().items.filter((item) => item.categoryId === categoryId)
  }
  const groups = createMemo<AnchoredListboxGroup[]>(() => {
    if (showsCategories()) {
      return [
        {
          id: 'categories',
          options: dispatch().categories.map((category) => ({
            value: `category:${category.id}`,
            label: category.label,
            description: category.description,
          })),
        },
      ]
    }
    return itemGroups(visibleItems())
  })
  const actions = createMemo(() => {
    const table = new Map<string, MenuAction>()
    for (const category of dispatch().categories) {
      table.set(`category:${category.id}`, {kind: 'category', categoryId: category.id})
    }
    for (const item of dispatch().items) table.set(`item:${item.id}`, {kind: 'item', item})
    return table
  })
  const optionCount = () => groups().reduce((total, group) => total + group.options.length, 0)
  const message = () => {
    if (dispatch().status === 'loading') return triggerStatusMessage('loading')
    if (optionCount() > 0) return undefined
    return triggerStatusMessage(dispatch().status)
  }
  const select = (value: string) => {
    props.onRefocus()
    if (dispatch().status === 'loading') return
    const action = actions().get(value)
    if (!action) return
    if (action.kind === 'category') {
      props.onEnterCategory(action.categoryId)
      return
    }
    dispatch().command(action.item)
  }
  return (
    <AnchoredListbox
      anchor={dispatch().rect}
      label={dispatch().sourceLabel}
      groups={groups()}
      message={message()}
      busy={dispatch().status === 'loading'}
      onSelect={select}
      onDismiss={props.onDismiss}
      onReady={props.onListbox}
      leading={
        <Show when={activeCategory()}>
          {(category) => (
            <Button
              variant="ghost"
              size="bare"
              class={BACK}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                props.onRefocus()
                props.onLeaveCategory()
              }}
            >
              <span aria-hidden="true">←</span>
              <span class={BACK_LABEL}>{category().label}</span>
            </Button>
          )}
        </Show>
      }
    />
  )
}
