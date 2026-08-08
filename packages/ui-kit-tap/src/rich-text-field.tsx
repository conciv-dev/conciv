import {Show, createEffect, onCleanup, onMount, type JSX} from 'solid-js'
import {Editor, type CommandProps} from '@tiptap/core'
import type {EditorView} from '@tiptap/pm/view'
import {UndoRedo} from '@tiptap/extensions'
import {EditorState, Selection, TextSelection} from '@tiptap/pm/state'
import {Slice, type Schema} from '@tiptap/pm/model'
import {ScrollArea} from '@conciv/ui-kit-system'
import {chipExtension, documentExtensions} from './field-schema.js'
import {buildDocument, offsetToPosition, paragraphFragment, positionToOffset, projectDocument} from './lowering.js'
import {TriggerMenu, createTriggerMenu} from './trigger-menu.js'
import {
  ChipForwardDelete,
  dismissTrigger,
  triggerMenuKeyDown,
  triggerSuggestion,
  type RichTextFieldTriggerCategory,
  type RichTextFieldTriggerItem,
  type RichTextFieldTriggerSource,
} from './trigger-suggestions.js'

export type {RichTextFieldTriggerCategory, RichTextFieldTriggerItem, RichTextFieldTriggerSource}

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

function plainTextSlice(schema: Schema, text: string): Slice {
  return new Slice(paragraphFragment(schema, text), 1, 1)
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
    tr.replaceSelection(plainTextSlice(state.schema, text)).scrollIntoView()
    return true
  }
}

function appendCommand(text: string) {
  return ({tr, state}: CommandProps) => {
    const end = Selection.atEnd(state.doc).from
    tr.replace(end, end, plainTextSlice(state.schema, text))
    return true
  }
}

function openingSelectionCommand(selection: RichTextFieldSelection | undefined) {
  return ({tr, state}: CommandProps) => {
    if (!selection) {
      tr.setSelection(Selection.atEnd(tr.doc))
      return true
    }
    const from = offsetToPosition(state.doc, selection.start)
    const to = offsetToPosition(state.doc, selection.end)
    tr.setSelection(TextSelection.create(tr.doc, from, to))
    return true
  }
}

function enterAction(editor: Editor, event: KeyboardEvent, submit: () => void): boolean {
  if (event.key !== 'Enter') return false
  if (event.shiftKey) return editor.commands.splitBlock()
  submit()
  return true
}

type EditablePopup = {expanded: boolean; controls: string | undefined; activeOption: string | undefined}

function popupAttributes(popup: EditablePopup): Record<string, string> {
  return {
    'aria-haspopup': 'listbox',
    'aria-expanded': popup.expanded ? 'true' : 'false',
    ...(popup.controls ? {'aria-controls': popup.controls} : {}),
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
  let editorInstance: Editor | undefined
  const menu = createTriggerMenu()
  const submitDraft = () => props.onSubmit?.()
  const editableAttributeSet = () =>
    editableAttributes({
      label: props.label,
      disabled: props.disabled,
      editableClass: props.editableClass,
      minRows: props.minRows,
      popup: {
        expanded: menu.state() !== null,
        controls: menu.access.listbox()?.listboxId,
        activeOption: menu.access.listbox()?.activeOptionId(),
      },
    })
  const suggestions = [
    triggerSuggestion({char: '/', source: () => props.slashTrigger, access: menu.access}),
    triggerSuggestion({char: '@', source: () => props.mentionTrigger, access: menu.access}),
  ]

  onMount(() => {
    if (!host) return
    const editor: Editor = new Editor({
      element: host,
      content: buildDocument(props.value),
      editorProps: {
        handleKeyDown: (editorState, event) => {
          const history = chordHistoryCommand(event)
          if (history) return applyHistory(editor, history)
          if (insideComposition(editorState, event)) return false
          if (triggerMenuKeyDown(menu.access, event)) return true
          return enterAction(editor, event, submitDraft)
        },
        handlePaste: (_view, event) => {
          if (props.onPaste?.(event) === true) return true
          const pasted = clipboardText(event.clipboardData)
          if (pasted) editor.chain().command(replaceSelectionCommand(pasted)).run()
          return true
        },
      },
      onUpdate: ({editor: instance}) => {
        props.onValueChange(projectDocument(instance.state.doc))
      },
      onSelectionUpdate: ({editor: instance}) => {
        const handler = props.onSelectionChange
        if (!handler) return
        const {doc, selection} = instance.state
        handler({start: positionToOffset(doc, selection.from), end: positionToOffset(doc, selection.to)})
      },
      extensions: [
        ...documentExtensions,
        UndoRedo,
        ChipForwardDelete,
        chipExtension.configure({
          HTMLAttributes: {'data-chip': ''},
          deleteTriggerWithBackspace: true,
          renderHTML: ({options, node}) => ['span', options.HTMLAttributes, String(node.attrs.label ?? node.attrs.id)],
          suggestions,
        }),
      ],
    })
    editorView = editor.view
    editorInstance = editor
    editor.chain().command(openingSelectionCommand(props.initialSelection)).run()
    onCleanup(() => editor.destroy())

    createEffect(() => {
      const value = props.value
      if (value === projectDocument(editor.state.doc)) return
      const doc = editor.schema.nodeFromJSON(buildDocument(value))
      editor.view.updateState(EditorState.create({doc, selection: Selection.atEnd(doc), plugins: editor.state.plugins}))
    })

    createEffect(() => {
      editor.setEditable(!props.disabled, false)
      editor.view.setProps({attributes: editableAttributeSet()})
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
      <TriggerMenu
        menu={menu}
        onDismiss={(char) => editorView && dismissTrigger(editorView, suggestions, char)}
        onRefocus={() => editorInstance?.commands.focus()}
      />
    </div>
  )
}
