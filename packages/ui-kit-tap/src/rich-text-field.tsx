import {Show, createEffect, createSignal, onCleanup, onMount, type JSX} from 'solid-js'
import {Editor, type CommandProps} from '@tiptap/core'
import type {EditorView} from '@tiptap/pm/view'
import {Document} from '@tiptap/extension-document'
import {Paragraph} from '@tiptap/extension-paragraph'
import {Text} from '@tiptap/extension-text'
import {UndoRedo} from '@tiptap/extensions'
import {EditorState, Selection} from '@tiptap/pm/state'
import {Fragment, Slice, type Schema} from '@tiptap/pm/model'
import {ScrollArea} from '@conciv/ui-kit-system'
import {buildDocument, positionToOffset, projectDocument} from './lowering.js'

export type RichTextFieldSelection = {start: number; end: number}

export type RichTextFieldHandle = {
  focus: (options?: {end?: boolean}) => void
  clear: () => void
  insertText: (text: string) => void
  appendText: (text: string) => void
}

const FIELD =
  'w-full relative bg-pw-sunken text-[0.8125rem] text-pw-text rounded-pw-md [border:1px_solid_var(--pw-line)] focus-within:[border-color:var(--pw-accent-line)] [&[data-disabled]]:opacity-60'
const VIEWPORT = 'w-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
const EDITABLE = 'px-2 py-1.5 leading-5 whitespace-pre-wrap break-words [outline:none]'
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

function enterInsideComposition(view: EditorView, event: KeyboardEvent): boolean {
  return event.isComposing || view.composing || event.keyCode === 229
}

function submitOnEnter(editor: Editor, event: KeyboardEvent, submit: (() => void) | undefined): boolean {
  if (event.shiftKey) return editor.commands.splitBlock()
  submit?.()
  return true
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

function editableAttributes(options: {
  label: string
  disabled: boolean | undefined
  editableClass: string | undefined
  minRows: number | undefined
}): Record<string, string> {
  return {
    role: 'textbox',
    'aria-multiline': 'true',
    'aria-label': options.label,
    ...(options.disabled ? {'aria-disabled': 'true'} : {}),
    class: `${EDITABLE} ${options.editableClass ?? ''}`,
    style: `min-height: ${rowHeight(options.minRows ?? 1)}`,
  }
}

export function RichTextField(props: {
  value: string
  onValueChange: (value: string) => void
  onSubmit?: () => void
  onSelectionChange?: (selection: RichTextFieldSelection) => void
  placeholder?: string
  label: string
  disabled?: boolean
  minRows?: number
  maxRows?: number
  viewportClass?: string
  editableClass?: string
  onPaste?: (event: ClipboardEvent) => boolean
  onReady?: (handle: RichTextFieldHandle) => void
}): JSX.Element {
  let host: HTMLDivElement | undefined
  const [editorInstance, setEditorInstance] = createSignal<Editor | null>(null)

  onMount(() => {
    if (!host) return
    const editor: Editor = new Editor({
      element: host,
      content: buildDocument(props.value),
      editorProps: {
        handleKeyDown: (view, event) => {
          const history = chordHistoryCommand(event)
          if (history) return applyHistory(editor, history)
          if (event.key !== 'Enter' || enterInsideComposition(view, event)) return false
          return submitOnEnter(editor, event, props.onSubmit)
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
      extensions: [Document, Paragraph, Text, UndoRedo],
    })
    setEditorInstance(editor)
    props.onReady?.({
      focus: (focusOptions) => {
        editor.commands.focus(focusOptions?.end ? 'end' : undefined)
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
  onCleanup(() => editorInstance()?.destroy())

  createEffect(() => {
    const editor = editorInstance()
    if (!editor) return
    const value = props.value
    if (value === projectDocument(editor.state.doc.toJSON())) return
    const doc = editor.schema.nodeFromJSON(buildDocument(value))
    editor.view.updateState(EditorState.create({doc, selection: Selection.atEnd(doc), plugins: editor.state.plugins}))
  })

  createEffect(() => {
    const editor = editorInstance()
    if (!editor) return
    editor.setEditable(!props.disabled, false)
  })

  createEffect(() => {
    const editor = editorInstance()
    if (!editor) return
    editor.view.setProps({
      attributes: editableAttributes({
        label: props.label,
        disabled: props.disabled,
        editableClass: props.editableClass,
        minRows: props.minRows,
      }),
    })
  })

  const viewportClass = () => `${VIEWPORT}  ${props.viewportClass ?? ''}`
  const capHeight = () => ({'max-height': rowHeight(props.maxRows ?? 5)})
  const placeholderText = () => props.value === '' && props.placeholder

  return (
    <div class={FIELD} data-disabled={props.disabled ? '' : undefined}>
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
    </div>
  )
}
