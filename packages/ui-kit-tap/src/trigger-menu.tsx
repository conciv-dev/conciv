import {For, Show, createMemo, createSignal, type JSX} from 'solid-js'
import {AnchoredListbox, Button, createListCollection, type AnchoredListboxHandle} from '@conciv/ui-kit-system'
import {
  triggerStatusMessage,
  type RichTextFieldTriggerItem,
  type TriggerDispatchState,
  type TriggerMenuAccess,
  type TriggerMenuState,
} from './trigger-suggestions.js'

type MenuAction = {kind: 'item'; item: RichTextFieldTriggerItem} | {kind: 'category'; categoryId: string}

type MenuRow = {value: string; label: string; description?: string; action: MenuAction}

type MenuGroup = {id: string; label?: string; rows: MenuRow[]}

type TriggerMenuItemContent = (item: RichTextFieldTriggerItem) => JSX.Element

const BACK = 'w-full gap-1.5 min-h-11 px-2.5 text-[0.8125rem] text-chat-text-2'
const BACK_LABEL = 'flex-1 text-start truncate'

export type TriggerMenuController = {
  state: () => TriggerMenuState | null
  access: TriggerMenuAccess
  setListbox: (handle: AnchoredListboxHandle | null) => void
}

export function createTriggerMenu(): TriggerMenuController {
  const [state, setState] = createSignal<TriggerMenuState | null>(null)
  const [listbox, setListbox] = createSignal<AnchoredListboxHandle | null>(null)
  const access: TriggerMenuAccess = {
    state,
    open: (dispatch: TriggerDispatchState) => {
      setState((current) => ({
        dispatch,
        categoryId: current?.dispatch.char === dispatch.char ? current.categoryId : null,
      }))
    },
    close: (char: string) => {
      setState((current) => (current?.dispatch.char === char ? null : current))
    },
    enterCategory: (categoryId: string) => setState((current) => current && {...current, categoryId}),
    leaveCategory: () => setState((current) => current && {...current, categoryId: null}),
    listbox,
  }
  return {state, access, setListbox}
}

export function triggerPopupAttributes(menu: TriggerMenuController): Record<string, string> {
  const listbox = menu.access.listbox()
  const activeOption = listbox?.activeOptionId()
  return {
    'aria-haspopup': 'listbox',
    'aria-expanded': menu.state() !== null ? 'true' : 'false',
    ...(listbox ? {'aria-controls': listbox.listboxId} : {}),
    ...(activeOption ? {'aria-activedescendant': activeOption} : {}),
  }
}

function itemRow(item: RichTextFieldTriggerItem): MenuRow {
  return {value: `item:${item.id}`, label: item.label, description: item.description, action: {kind: 'item', item}}
}

function categoryRow(category: {id: string; label: string; description?: string}): MenuRow {
  return {
    value: `category:${category.id}`,
    label: category.label,
    description: category.description,
    action: {kind: 'category', categoryId: category.id},
  }
}

const groupKey = (item: RichTextFieldTriggerItem): string => item.group ?? ''

function groupLabel(key: string): string | undefined {
  if (key === '') return undefined
  return key
}

function bucketItems(items: readonly RichTextFieldTriggerItem[]): Map<string, MenuRow[]> {
  const buckets = new Map<string, MenuRow[]>()
  for (const item of items) {
    const bucket = buckets.get(groupKey(item)) ?? []
    bucket.push(itemRow(item))
    buckets.set(groupKey(item), bucket)
  }
  return buckets
}

function itemGroups(items: readonly RichTextFieldTriggerItem[]): MenuGroup[] {
  return Array.from(bucketItems(items), ([key, rows], position) => ({
    id: `group-${position}`,
    label: groupLabel(key),
    rows,
  }))
}

function MenuPanel(props: {
  state: TriggerMenuState
  access: TriggerMenuAccess
  setListbox: (handle: AnchoredListboxHandle | null) => void
  onDismiss: (char: string) => void
  onRefocus: () => void
  itemContent: TriggerMenuItemContent | undefined
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
  const groups = createMemo<MenuGroup[]>(() => {
    if (showsCategories()) return [{id: 'categories', rows: dispatch().categories.map(categoryRow)}]
    return itemGroups(visibleItems())
  })
  const rows = createMemo(() => groups().flatMap((group) => group.rows))
  const collection = createMemo(() =>
    createListCollection({
      items: rows(),
      itemToValue: (row: MenuRow) => row.value,
      itemToString: (row: MenuRow) => row.label,
    }),
  )
  const loading = () => dispatch().status === 'loading'
  const message = () => {
    if (loading()) return triggerStatusMessage('loading')
    if (rows().length > 0) return undefined
    return triggerStatusMessage(dispatch().status)
  }
  const rowContent = (row: MenuRow): JSX.Element => {
    const content = props.itemContent
    if (row.action.kind === 'item' && content) return content(row.action.item)
    return <AnchoredListbox.ItemText>{row.label}</AnchoredListbox.ItemText>
  }
  const select = (value: string) => {
    props.onRefocus()
    if (loading()) return
    const row = rows().find((candidate) => candidate.value === value)
    if (!row) return
    if (row.action.kind === 'category') {
      props.access.enterCategory(row.action.categoryId)
      return
    }
    dispatch().command(row.action.item)
  }
  return (
    <AnchoredListbox.Root
      anchor={dispatch().rect}
      collection={collection()}
      onSelect={select}
      onDismiss={() => props.onDismiss(dispatch().char)}
      onReady={props.setListbox}
    >
      <AnchoredListbox.Label>{dispatch().sourceLabel}</AnchoredListbox.Label>
      <Show when={activeCategory()}>
        {(category) => (
          <Button
            variant="ghost"
            size="bare"
            class={BACK}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              props.onRefocus()
              props.access.leaveCategory()
            }}
          >
            <span aria-hidden="true">←</span>
            <span class={BACK_LABEL}>{category().label}</span>
          </Button>
        )}
      </Show>
      <AnchoredListbox.Content busy={loading()}>
        <For each={groups()}>
          {(group) => (
            <AnchoredListbox.ItemGroup id={group.id}>
              <Show when={group.label}>
                {(label) => <AnchoredListbox.ItemGroupLabel>{label()}</AnchoredListbox.ItemGroupLabel>}
              </Show>
              <For each={group.rows}>
                {(row) => (
                  <AnchoredListbox.Item item={row} name={row.label} description={row.description}>
                    {rowContent(row)}
                  </AnchoredListbox.Item>
                )}
              </For>
            </AnchoredListbox.ItemGroup>
          )}
        </For>
      </AnchoredListbox.Content>
      <Show when={message()}>{(text) => <AnchoredListbox.Message>{text()}</AnchoredListbox.Message>}</Show>
    </AnchoredListbox.Root>
  )
}

export function TriggerMenu(props: {
  menu: TriggerMenuController
  onDismiss: (char: string) => void
  onRefocus: () => void
  children?: TriggerMenuItemContent
}): JSX.Element {
  return (
    <Show when={props.menu.state()}>
      {(state) => (
        <MenuPanel
          state={state()}
          access={props.menu.access}
          setListbox={props.menu.setListbox}
          onDismiss={props.onDismiss}
          onRefocus={props.onRefocus}
          itemContent={props.children}
        />
      )}
    </Show>
  )
}
