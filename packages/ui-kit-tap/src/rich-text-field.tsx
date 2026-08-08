import {Show, createEffect, createMemo, createSignal, createUniqueId, onCleanup, onMount, type JSX} from 'solid-js'
import {Editor, type CommandProps} from '@tiptap/core'
import type {EditorView} from '@tiptap/pm/view'
import {Document} from '@tiptap/extension-document'
import {Paragraph} from '@tiptap/extension-paragraph'
import {Text} from '@tiptap/extension-text'
import {Mention} from '@tiptap/extension-mention'
import {exitSuggestion} from '@tiptap/suggestion'
import {UndoRedo} from '@tiptap/extensions'
import {EditorState, Selection, TextSelection} from '@tiptap/pm/state'
import {Fragment, Slice, type Schema} from '@tiptap/pm/model'
import {ScrollArea} from '@conciv/ui-kit-system'
import {buildDocument, offsetToPosition, positionToOffset, projectDocument} from './lowering.js'
import {SuggestionListbox, type SuggestionAnchor} from './suggestion-listbox.js'
import {
  ChipForwardDelete,
  triggerStatusMessage,
  triggerSuggestion,
  type RichTextFieldTriggerItem,
  type RichTextFieldTriggerSource,
  type TriggerPopoverState,
} from './trigger-suggestions.js'

export type {RichTextFieldTriggerItem, RichTextFieldTriggerSource}

export type RichTextFieldSelection = {start: number; end: number}

export type RichTextFieldHandle = {
  focus: (options?: {end?: boolean}) => void
  clear: () => void
  insertText: (text: string) => void
  appendText: (text: string) => void
}

const VIEWPORT = 'w-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
const EDITABLE =
  'px-2 py-1.5 leading-5 whitespace-pre-wrap break-words [outline:none] [&_[data-chip]]:text-pw-accent-hi [&_[data-chip]]:bg-pw-accent-08 [&_[data-chip]]:rounded-pw-sm [&_[data-chip]]:px-0.5'
const PLACEHOLDER = 'pointer-events-none absolute left-2 top-1.5 leading-5 text-[0.8125rem] text-pw-text-3 select-none'

function plainTextSlice(schema: Schema, text: string): Slice | null {
  const paragraphType = schema.nodes.paragraph
  if (!paragraphType) return null
  const paragraphs = text.split('\n').map((line) => paragraphType.create(null, line ? schema.text(line) : undefined))
  return new Slice(Fragment.fromArray(paragraphs), 1, 1)
}

const rowHeight = (rows: number): string => `calc(${rows} * 1.25rem + 0.75rem)`

function historyKey(event: KeyboardEvent): 'undo' | 'redo' | null {
  const key = event.key.toLowerCase()
  if (key === 'y') return 'redo'
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo'
  return null
}

function chordHistoryCommand(event: KeyboardEvent): 'undo' | 'redo' | null {
  const chord = event.metaKey || event.ctrlKey
  if (!chord) return null
  return historyKey(event)
}

function applyHistory(editor: Editor, command: 'undo' | 'redo'): true {
  if (command === 'undo') editor.commands.undo()
  if (command === 'redo') editor.commands.redo()
  return true
}

function insideComposition(view: EditorView, event: KeyboardEvent): boolean {
  return event.isComposing || view.composing || event.keyCode === 229
}

function clipboardText(clipboard: DataTransfer | null): string {
  if (!clipboard) return ''
  if (clipboard.files.length > 0) return ''
  return clipboard.getData('text/plain')
}

function replaceSelectionCommand(text: string) {
  return ({tr, state}: CommandProps) => {
    const slice = plainTextSlice(state.schema, text)
    if (!slice) return false
    tr.replaceSelection(slice).scrollIntoView()
    return true
  }
}

function appendCommand(text: string) {
  return ({tr, state}: CommandProps) => {
    const slice = plainTextSlice(state.schema, text)
    if (!slice) return false
    const end = Selection.atEnd(state.doc).from
    tr.replace(end, end, slice)
    return true
  }
}

function openingSelectionCommand(selection: RichTextFieldSelection | undefined) {
  return ({tr, state}: CommandProps) => {
    if (!selection) {
      tr.setSelection(Selection.atEnd(tr.doc))
      return true
    }
    const json = state.doc.toJSON()
    const from = offsetToPosition(json, selection.start)
    const to = offsetToPosition(json, selection.end)
    tr.setSelection(TextSelection.create(tr.doc, from, to))
    return true
  }
}

type PopoverView = {
  anchor: SuggestionAnchor | null
  label: string
  options: RichTextFieldTriggerItem[]
  activeIndex: number
  inert: boolean
  message: string | undefined
}

const CLOSED_POPOVER: PopoverView = {
  anchor: null,
  label: '',
  options: [],
  activeIndex: 0,
  inert: false,
  message: undefined,
}

function popoverMessage(state: TriggerPopoverState): string | undefined {
  if (state.status === 'loading') return triggerStatusMessage('loading')
  if (state.items.length > 0) return undefined
  return triggerStatusMessage(state.status)
}

function popoverView(state: TriggerPopoverState | null): PopoverView {
  if (!state) return CLOSED_POPOVER
  return {
    anchor: state.rect,
    label: state.sourceLabel,
    options: state.items,
    activeIndex: state.activeIndex,
    inert: state.status === 'loading',
    message: popoverMessage(state),
  }
}

function enterAction(editor: Editor, event: KeyboardEvent, claimed: boolean, submit: () => void): boolean {
  if (event.shiftKey) return editor.commands.splitBlock()
  if (claimed) return false
  submit()
  return true
}

type EditablePopup = {expanded: boolean; controls: string; activeOption: string | undefined}

function popupAttributes(popup: EditablePopup): Record<string, string> {
  return {
    'aria-haspopup': 'listbox',
    'aria-expanded': popup.expanded ? 'true' : 'false',
    ...(popup.expanded ? {'aria-controls': popup.controls} : {}),
    ...(popup.activeOption ? {'aria-activedescendant': popup.activeOption} : {}),
  }
}

function editableAttributes(options: {
  label: string
  disabled: boolean | undefined
  editableClass: string | undefined
  minRows: number | undefined
  popup: EditablePopup
}): Record<string, string> {
  return {
    role: 'textbox',
    'aria-multiline': 'true',
    'aria-label': options.label,
    ...(options.disabled ? {'aria-disabled': 'true'} : {}),
    ...popupAttributes(options.popup),
    class: `${EDITABLE} ${options.editableClass ?? ''}`,
    style: `min-height: ${rowHeight(options.minRows ?? 1)}`,
  }
}

export function RichTextField(props: {
  value: string
  onValueChange: (value: string) => void
  onSubmit?: () => void
  onSelectionChange?: (selection: RichTextFieldSelection) => void
  initialSelection?: RichTextFieldSelection
  placeholder?: string
  label: string
  disabled?: boolean
  minRows?: number
  maxRows?: number
  class?: string
  viewportClass?: string
  editableClass?: string
  onPaste?: (event: ClipboardEvent) => boolean
  onReady?: (handle: RichTextFieldHandle) => void
  slashTrigger?: RichTextFieldTriggerSource
  mentionTrigger?: RichTextFieldTriggerSource
}): JSX.Element {
  let host: HTMLDivElement | undefined
  let editorView: EditorView | undefined
  const [popover, setPopover] = createSignal<TriggerPopoverState | null>(null)
  const fieldId = createUniqueId()
  const listboxId = `rich-text-field-${fieldId}-listbox`
  const optionId = (item: RichTextFieldTriggerItem) => `rich-text-field-${fieldId}-option-${item.id}`
  const popoverAccess = {state: popover, update: (state: TriggerPopoverState | null) => setPopover(state)}
  const view = createMemo(() => popoverView(popover()))
  const popoverConsumesEnter = () => view().inert || view().options.length > 0
  const submitDraft = () => props.onSubmit?.()
  const activeOptionId = () => {
    const item = view().options[view().activeIndex]
    return item ? optionId(item) : undefined
  }
  const suggestions = [
    triggerSuggestion({char: '/', source: () => props.slashTrigger, access: popoverAccess}),
    triggerSuggestion({char: '@', source: () => props.mentionTrigger, access: popoverAccess}),
  ]
  const dismissPopover = () => {
    const state = popover()
    const open = suggestions.find((suggestion) => suggestion.char === state?.char)
    if (!open || !editorView) return
    exitSuggestion(editorView, open.pluginKey)
  }

  onMount(() => {
    if (!host) return
    const editor: Editor = new Editor({
      element: host,
      content: buildDocument(props.value),
      editorProps: {
        handleKeyDown: (editorState, event) => {
          const history = chordHistoryCommand(event)
          if (history) return applyHistory(editor, history)
          if (event.key !== 'Enter' || insideComposition(editorState, event)) return false
          return enterAction(editor, event, popoverConsumesEnter(), submitDraft)
        },
        handlePaste: (_view, event) => {
          if (props.onPaste?.(event) === true) return true
          const pasted = clipboardText(event.clipboardData)
          if (pasted) editor.chain().command(replaceSelectionCommand(pasted)).run()
          return true
        },
      },
      onUpdate: ({editor: instance}) => {
        props.onValueChange(projectDocument(instance.state.doc.toJSON()))
      },
      onSelectionUpdate: ({editor: instance}) => {
        const handler = props.onSelectionChange
        if (!handler) return
        const json = instance.state.doc.toJSON()
        const {from, to} = instance.state.selection
        handler({start: positionToOffset(json, from), end: positionToOffset(json, to)})
      },
      extensions: [
        Document,
        Paragraph,
        Text,
        UndoRedo,
        ChipForwardDelete,
        Mention.configure({
          HTMLAttributes: {'data-chip': ''},
          deleteTriggerWithBackspace: true,
          renderText: ({node}) => `${String(node.attrs.mentionSuggestionChar)}${String(node.attrs.id)}`,
          renderHTML: ({options, node}) => ['span', options.HTMLAttributes, String(node.attrs.label ?? node.attrs.id)],
          suggestions,
        }),
      ],
    })
    editorView = editor.view
    editor.chain().command(openingSelectionCommand(props.initialSelection)).run()
    onCleanup(() => editor.destroy())

    createEffect(() => {
      const value = props.value
      if (value === projectDocument(editor.state.doc.toJSON())) return
      const doc = editor.schema.nodeFromJSON(buildDocument(value))
      editor.view.updateState(EditorState.create({doc, selection: Selection.atEnd(doc), plugins: editor.state.plugins}))
    })

    createEffect(() => {
      editor.setEditable(!props.disabled, false)
      editor.view.setProps({
        attributes: editableAttributes({
          label: props.label,
          disabled: props.disabled,
          editableClass: props.editableClass,
          minRows: props.minRows,
          popup: {expanded: popover() !== null, controls: listboxId, activeOption: activeOptionId()},
        }),
      })
    })

    props.onReady?.({
      focus: (focusOptions) => {
        editor.commands.focus(focusOptions?.end ? 'end' : editor.state.selection.from)
      },
      clear: () => {
        editor.commands.clearContent(true)
      },
      insertText: (text) => {
        editor.chain().focus().command(replaceSelectionCommand(text)).run()
      },
      appendText: (text) => {
        editor.chain().command(appendCommand(text)).run()
      },
    })
  })

  const viewportClass = () => `${VIEWPORT}  ${props.viewportClass ?? ''}`
  const capHeight = () => ({'max-height': rowHeight(props.maxRows ?? 5)})
  const placeholderText = () => props.value === '' && props.placeholder

  return (
    <div class={`w-full relative ${props.class ?? ''}`} data-disabled={props.disabled ? '' : undefined}>
      <ScrollArea.Root>
        <ScrollArea.Viewport class={viewportClass()} style={capHeight()}>
          <ScrollArea.Content>
            <div ref={(element) => (host = element)} class="w-full" />
          </ScrollArea.Content>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar>
          <ScrollArea.Thumb />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
      <Show when={placeholderText()}>{(text) => <span class={PLACEHOLDER}>{text()}</span>}</Show>
      <SuggestionListbox
        anchor={view().anchor}
        label={view().label}
        options={view().options}
        activeIndex={view().activeIndex}
        inert={view().inert}
        message={view().message}
        listboxId={listboxId}
        optionId={optionId}
        onSelect={(item) => popover()?.command(item)}
        onDismiss={dismissPopover}
      />
    </div>
  )
}
