import {Extension} from '@tiptap/core'
import {PluginKey} from '@tiptap/pm/state'
import type {EditorView} from '@tiptap/pm/view'
import {exitSuggestion} from '@tiptap/suggestion'
import type {MentionNodeAttrs, MentionOptions} from '@tiptap/extension-mention'
import type {AnchoredListboxHandle, AnchoredListboxRect} from '@conciv/ui-kit-system'

export type RichTextFieldTriggerItem = {
  id: string
  label: string
  description?: string
  group?: string
  categoryId?: string
}

export type RichTextFieldTriggerCategory = {id: string; label: string; description?: string}

export type RichTextFieldTriggerSource = {
  label: string
  categories?: readonly RichTextFieldTriggerCategory[]
  items: (query: string) => RichTextFieldTriggerItem[] | Promise<RichTextFieldTriggerItem[]>
}

type SuggestionConfig = MentionOptions<RichTextFieldTriggerItem, MentionNodeAttrs>['suggestions'][number]
type SuggestionRenderer = ReturnType<NonNullable<SuggestionConfig['render']>>
type SuggestionDispatch = Parameters<NonNullable<SuggestionRenderer['onStart']>>[0]
type SuggestionCommand = Parameters<NonNullable<SuggestionConfig['command']>>[0]
type SuggestionFetch = Parameters<NonNullable<SuggestionConfig['items']>>[0]

export type TriggerMenuStatus = 'loading' | 'ready' | 'error'

const STATUS_MESSAGES: Record<TriggerMenuStatus, string> = {
  loading: 'Loading suggestions…',
  error: 'Suggestions failed to load',
  ready: 'No matches',
}

export function triggerStatusMessage(status: TriggerMenuStatus): string {
  return STATUS_MESSAGES[status]
}

export type TriggerDispatchState = {
  char: string
  sourceLabel: string
  categories: readonly RichTextFieldTriggerCategory[]
  query: string
  status: TriggerMenuStatus
  items: readonly RichTextFieldTriggerItem[]
  rect: AnchoredListboxRect
  command: (item: RichTextFieldTriggerItem) => void
}

export type TriggerMenuState = {dispatch: TriggerDispatchState; categoryId: string | null}

export type TriggerMenuAccess = {
  state: () => TriggerMenuState | null
  open: (dispatch: TriggerDispatchState) => void
  close: (char: string) => void
  enterCategory: (categoryId: string) => void
  leaveCategory: () => void
  listbox: () => AnchoredListboxHandle | null
}

export const ChipForwardDelete = Extension.create({
  name: 'chipForwardDelete',
  addKeyboardShortcuts() {
    return {
      Delete: () =>
        this.editor.commands.command(({tr, state}) => {
          const {empty, $anchor} = state.selection
          if (!empty) return false
          const nodeAfter = $anchor.nodeAfter
          if (nodeAfter?.type.name !== 'mention') return false
          tr.delete($anchor.pos, $anchor.pos + nodeAfter.nodeSize)
          return true
        }),
    }
  },
})

function chipContent(char: string, id: string, label: string, spaceFollows: boolean) {
  const chip = {type: 'mention', attrs: {id, label, mentionSuggestionChar: char}}
  return spaceFollows ? [chip] : [chip, {type: 'text', text: ' '}]
}

function insertChip(char: string) {
  return ({editor, range, props: item}: SuggestionCommand): void => {
    if (item.id === null) return
    const nodeAfter = editor.view.state.selection.$to.nodeAfter
    const spaceFollows = nodeAfter?.text?.startsWith(' ') === true
    const content = chipContent(char, item.id, item.label ?? item.id, spaceFollows)
    editor.chain().focus().insertContentAt(range, content).run()
  }
}

function anchorRect(dispatch: SuggestionDispatch): AnchoredListboxRect | null {
  const rect = dispatch.clientRect?.() ?? null
  return rect ? {x: rect.x, y: rect.y, width: rect.width, height: rect.height} : null
}

function dispatchState(input: {
  char: string
  dispatch: SuggestionDispatch
  source: RichTextFieldTriggerSource
  rect: AnchoredListboxRect
  carry: TriggerMenuState | null
  status: TriggerMenuStatus
}): TriggerDispatchState {
  return {
    char: input.char,
    sourceLabel: input.source.label,
    categories: input.source.categories ?? [],
    query: input.dispatch.query,
    status: input.status,
    items: input.carry?.dispatch.items ?? input.dispatch.items,
    rect: input.rect,
    command: input.dispatch.command,
  }
}

export function triggerSuggestion(options: {
  char: string
  source: () => RichTextFieldTriggerSource | undefined
  access: TriggerMenuAccess
}): SuggestionConfig {
  let errorQuery: string | null = null

  const fetchItems = async (fetch: SuggestionFetch): Promise<RichTextFieldTriggerItem[]> => {
    const source = options.source()
    if (!source) return []
    try {
      const items = await source.items(fetch.query)
      errorQuery = null
      return items
    } catch {
      if (!fetch.signal.aborted) errorQuery = fetch.query
      return []
    }
  }

  const carried = (dispatch: SuggestionDispatch): TriggerMenuState | null => {
    if (!dispatch.loading) return null
    const current = options.access.state()
    return current?.dispatch.char === options.char ? current : null
  }

  const status = (dispatch: SuggestionDispatch): TriggerMenuStatus => {
    if (dispatch.loading) return 'loading'
    return errorQuery === dispatch.query ? 'error' : 'ready'
  }

  const openMenu = (dispatch: SuggestionDispatch): void => {
    const source = options.source()
    const rect = anchorRect(dispatch)
    if (!source || !rect) {
      options.access.close(options.char)
      return
    }
    options.access.open(
      dispatchState({char: options.char, dispatch, source, rect, carry: carried(dispatch), status: status(dispatch)}),
    )
  }

  return {
    char: options.char,
    pluginKey: new PluginKey(`trigger-suggestion-${options.char}`),
    command: insertChip(options.char),
    items: fetchItems,
    render: () => ({
      onStart: openMenu,
      onUpdate: openMenu,
      onExit: () => options.access.close(options.char),
    }),
  }
}

type MenuKeyAction = 'ignore' | 'inert' | 'back' | 'dismiss' | 'commit' | 'commitOrDismiss' | 'forward'

export type TriggerMenuKeyboard = {
  dismiss: (char: string) => void
  tabCommits: boolean
}

type MenuKeyContext = {
  access: TriggerMenuAccess
  state: TriggerMenuState
  event: KeyboardEvent
  keyboard: TriggerMenuKeyboard
}

function consumeKey(event: KeyboardEvent): true {
  event.preventDefault()
  return true
}

type MenuKeyResolver = (state: TriggerMenuState, event: KeyboardEvent, tabCommits: boolean) => MenuKeyAction | null

const enterKeyAction: MenuKeyResolver = (state, event) => {
  if (event.key !== 'Enter') return null
  if (event.shiftKey) return 'ignore'
  if (state.dispatch.status === 'loading') return 'inert'
  return 'commit'
}

const backKeyAction: MenuKeyResolver = (state, event) => {
  if (event.key !== 'Backspace') return null
  if (state.categoryId === null) return null
  if (state.dispatch.query !== '') return null
  return 'back'
}

const tabKeyAction: MenuKeyResolver = (_state, event, tabCommits) => {
  if (event.key !== 'Tab') return null
  return tabCommits ? 'commitOrDismiss' : 'dismiss'
}

const KEY_ACTION_RESOLVERS = [enterKeyAction, backKeyAction, tabKeyAction]

function menuKeyAction(state: TriggerMenuState, event: KeyboardEvent, tabCommits: boolean): MenuKeyAction {
  for (const resolve of KEY_ACTION_RESOLVERS) {
    const action = resolve(state, event, tabCommits)
    if (action) return action
  }
  return 'forward'
}

function dismissMenu({state, event, keyboard}: MenuKeyContext): boolean {
  keyboard.dismiss(state.dispatch.char)
  return consumeKey(event)
}

function commitHighlighted({access, event}: MenuKeyContext): boolean {
  if (access.listbox()?.commitHighlighted() !== true) return false
  return consumeKey(event)
}

const MENU_KEY_ACTIONS: Record<MenuKeyAction, (context: MenuKeyContext) => boolean> = {
  ignore: () => false,
  inert: ({event}) => consumeKey(event),
  back: ({access, event}) => {
    access.leaveCategory()
    return consumeKey(event)
  },
  dismiss: dismissMenu,
  commit: commitHighlighted,
  commitOrDismiss: (context) => commitHighlighted(context) || dismissMenu(context),
  forward: ({access, event}) => access.listbox()?.handleKeyDown(event) === true,
}

export function triggerMenuKeyDown(
  access: TriggerMenuAccess,
  event: KeyboardEvent,
  keyboard: TriggerMenuKeyboard,
): boolean {
  const state = access.state()
  if (!state) return false
  return MENU_KEY_ACTIONS[menuKeyAction(state, event, keyboard.tabCommits)]({access, state, event, keyboard})
}

export function dismissTrigger(view: EditorView, suggestions: readonly SuggestionConfig[], char: string): void {
  const active = suggestions.find((suggestion) => suggestion.char === char)
  if (!active?.pluginKey) return
  exitSuggestion(view, active.pluginKey)
}
