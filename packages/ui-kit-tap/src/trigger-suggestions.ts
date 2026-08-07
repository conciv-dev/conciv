import {Extension} from '@tiptap/core'
import type {MentionNodeAttrs, MentionOptions} from '@tiptap/extension-mention'

export type RichTextFieldTriggerItem = {id: string; label: string}

export type RichTextFieldTriggerSource = {
  label: string
  items: (query: string) => RichTextFieldTriggerItem[] | Promise<RichTextFieldTriggerItem[]>
}

type SuggestionConfig = MentionOptions<RichTextFieldTriggerItem, MentionNodeAttrs>['suggestions'][number]
type SuggestionRenderer = ReturnType<NonNullable<SuggestionConfig['render']>>
type SuggestionDispatch = Parameters<NonNullable<SuggestionRenderer['onStart']>>[0]
type SuggestionKeyDown = Parameters<NonNullable<SuggestionRenderer['onKeyDown']>>[0]
type SuggestionCommand = Parameters<NonNullable<SuggestionConfig['command']>>[0]
type SuggestionFetch = Parameters<NonNullable<SuggestionConfig['items']>>[0]

export type TriggerPopoverStatus = 'loading' | 'ready' | 'error'

export type TriggerPopoverState = {
  char: string
  sourceLabel: string
  query: string
  status: TriggerPopoverStatus
  items: RichTextFieldTriggerItem[]
  activeIndex: number
  rect: {left: number; top: number} | null
  command: (item: RichTextFieldTriggerItem) => void
}

export type TriggerPopoverAccess = {
  state: () => TriggerPopoverState | null
  update: (state: TriggerPopoverState | null) => void
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

function popoverRect(dispatch: SuggestionDispatch): {left: number; top: number} | null {
  const rect = dispatch.clientRect?.() ?? null
  return rect ? {left: rect.left, top: rect.bottom + 4} : null
}

function arrowDelta(event: KeyboardEvent): number {
  if (event.key === 'ArrowDown') return 1
  if (event.key === 'ArrowUp') return -1
  return 0
}

function plainEnter(event: KeyboardEvent): boolean {
  return event.key === 'Enter' && !event.shiftKey
}

export function triggerSuggestion(options: {
  char: string
  source: () => RichTextFieldTriggerSource | undefined
  access: TriggerPopoverAccess
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

  const carried = (dispatch: SuggestionDispatch): TriggerPopoverState | null => {
    if (!dispatch.loading) return null
    const current = options.access.state()
    return current?.char === options.char ? current : null
  }

  const popoverStatus = (dispatch: SuggestionDispatch): TriggerPopoverStatus => {
    if (dispatch.loading) return 'loading'
    return errorQuery === dispatch.query ? 'error' : 'ready'
  }

  const popoverState = (dispatch: SuggestionDispatch, sourceLabel: string): TriggerPopoverState => {
    const carry = carried(dispatch)
    return {
      char: options.char,
      sourceLabel,
      query: dispatch.query,
      status: popoverStatus(dispatch),
      items: carry ? carry.items : dispatch.items,
      activeIndex: carry ? carry.activeIndex : 0,
      rect: popoverRect(dispatch),
      command: dispatch.command,
    }
  }

  const openPopover = (dispatch: SuggestionDispatch): void => {
    const source = options.source()
    if (!source) return
    options.access.update(popoverState(dispatch, source.label))
  }

  const selectableState = (): TriggerPopoverState | null => {
    const state = options.access.state()
    if (state?.char !== options.char) return null
    return state.items.length > 0 ? state : null
  }

  const navigate = (state: TriggerPopoverState, delta: number): true => {
    const activeIndex = (state.activeIndex + delta + state.items.length) % state.items.length
    options.access.update({...state, activeIndex})
    return true
  }

  const select = (state: TriggerPopoverState): boolean => {
    const item = state.items[state.activeIndex]
    if (!item) return false
    state.command(item)
    return true
  }

  const keydown = ({event}: SuggestionKeyDown): boolean => {
    const state = selectableState()
    if (!state) return false
    const delta = arrowDelta(event)
    if (delta !== 0) return navigate(state, delta)
    return plainEnter(event) && select(state)
  }

  return {
    char: options.char,
    command: insertChip(options.char),
    items: fetchItems,
    render: () => ({
      onStart: openPopover,
      onUpdate: openPopover,
      onExit: () => {
        if (options.access.state()?.char === options.char) options.access.update(null)
      },
      onKeyDown: keydown,
    }),
  }
}
