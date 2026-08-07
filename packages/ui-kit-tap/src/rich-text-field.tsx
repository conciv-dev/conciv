import {
  For,
  Show,
  batch,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  createUniqueId,
  onCleanup,
  onMount,
  type JSX,
} from 'solid-js'
import {Editor, mergeAttributes} from '@tiptap/core'
import {Document} from '@tiptap/extension-document'
import {Paragraph} from '@tiptap/extension-paragraph'
import {Text} from '@tiptap/extension-text'
import {Mention} from '@tiptap/extension-mention'
import {UndoRedo} from '@tiptap/extensions'
import {EditorState, Selection} from '@tiptap/pm/state'
import {Fragment, Slice, type Schema} from '@tiptap/pm/model'
import {ScrollArea} from '@conciv/ui-kit-system'
import {buildDocument, positionToOffset, projectDocument} from './lowering.js'

export type RichTextFieldItem = {id: string; label: string}

export type RichTextFieldTrigger = {
  char: string
  label: string
  items: (query: string) => Promise<RichTextFieldItem[]> | RichTextFieldItem[]
  renderItem?: (item: RichTextFieldItem) => JSX.Element
}

export type RichTextFieldSelection = {start: number; end: number}

export type RichTextFieldHandle = {
  focus: (options?: {end?: boolean}) => void
  clear: () => void
  insertText: (text: string) => void
  appendText: (text: string) => void
}

type SuggestionSnapshot = {
  char: string
  query: string
  command: (attributes: RichTextFieldItem) => void
  rect: DOMRect | null
}

const FIELD =
  'w-full relative bg-pw-sunken text-[0.8125rem] text-pw-text rounded-pw-md [border:1px_solid_var(--pw-line)] focus-within:[border-color:var(--pw-accent-line)] [&[data-disabled]]:opacity-60'
const VIEWPORT = 'w-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
const EDITABLE = 'px-2 py-1.5 leading-5 whitespace-pre-wrap break-words [outline:none]'
const CHIP = 'text-pw-accent-hi bg-pw-accent-08 rounded-pw-sm px-0.5'
const PLACEHOLDER = 'pointer-events-none absolute left-2 top-1.5 leading-5 text-[0.8125rem] text-pw-text-3 select-none'
const LISTBOX =
  'fixed z-[2147483647] min-w-44 max-h-56 overflow-auto rounded-pw-md bg-pw-panel text-pw-text border border-pw-line shadow-pw-lg p-1'
const OPTION = 'flex items-center gap-2 px-2 py-1.5 rounded-pw-sm text-[0.8125rem] cursor-pointer aria-selected:bg-pw-fill'
const STATUS = 'px-2 py-1.5 text-[0.8125rem] text-pw-text-3'

const chipDisplay = (char: string, label: string): string => (label.startsWith(char) ? label : `${char}${label}`)

function plainTextSlice(schema: Schema, text: string): Slice | null {
  const paragraphType = schema.nodes.paragraph
  if (!paragraphType) return null
  const paragraphs = text
    .split('\n')
    .map((line) => paragraphType.create(null, line ? schema.text(line) : undefined))
  return new Slice(Fragment.fromArray(paragraphs), 1, 1)
}

const rowHeight = (rows: number): string => `calc(${rows} * 1.25rem + 0.75rem)`

const ChipNode = Mention.extend({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Delete: () =>
        this.editor.commands.command(({tr, state}) => {
          const {empty, $from, from} = state.selection
          if (!empty) return false
          const nodeAfter = $from.nodeAfter
          if (!nodeAfter || nodeAfter.type.name !== this.name) return false
          tr.delete(from, from + nodeAfter.nodeSize)
          return true
        }),
    }
  },
})

export function RichTextField(props: {
  value: string
  onValueChange: (value: string) => void
  onSubmit?: () => void
  onSelectionChange?: (selection: RichTextFieldSelection) => void
  triggers?: RichTextFieldTrigger[]
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
  const baseId = createUniqueId()
  const listboxId = `rich-text-field-listbox-${baseId}`
  const optionId = (position: number): string => `${listboxId}-option-${position}`
  const [editorInstance, setEditorInstance] = createSignal<Editor | null>(null)
  const [projection, setProjection] = createSignal('')
  const [suggestion, setSuggestion] = createSignal<SuggestionSnapshot | null>(null)
  const [activeIndex, setActiveIndex] = createSignal(0)

  const request = createMemo(
    () => {
      const snapshot = suggestion()
      if (!snapshot) return null
      return {char: snapshot.char, query: snapshot.query}
    },
    null,
    {equals: (previous, next) => previous?.char === next?.char && previous?.query === next?.query},
  )
  const [fetched] = createResource(
    () => {
      const current = request()
      if (!current) return null
      const source = props.triggers?.find((trigger) => trigger.char === current.char)
      if (!source) return null
      return {source, query: current.query}
    },
    (input) => input.source.items(input.query),
  )
  const options = (): RichTextFieldItem[] => (fetched.error ? [] : (fetched() ?? []))
  const activeSource = (): RichTextFieldTrigger | undefined =>
    props.triggers?.find((trigger) => trigger.char === suggestion()?.char)

  const suggestionRenderer = (char: string) => () => ({
    onStart: (start: {query: string; command: (attributes: RichTextFieldItem) => void; clientRect?: (() => DOMRect | null) | null}) => {
      setSuggestion({char, query: start.query, command: start.command, rect: start.clientRect?.() ?? null})
      setActiveIndex(0)
    },
    onUpdate: (update: {query: string; command: (attributes: RichTextFieldItem) => void; clientRect?: (() => DOMRect | null) | null}) => {
      if (suggestion()?.query !== update.query) setActiveIndex(0)
      setSuggestion({char, query: update.query, command: update.command, rect: update.clientRect?.() ?? null})
    },
    onExit: () => setSuggestion(null),
    onKeyDown: ({event}: {event: KeyboardEvent}) => {
      const snapshot = suggestion()
      if (!snapshot) return false
      const items = options()
      if (event.key === 'ArrowDown') {
        if (items.length) setActiveIndex((activeIndex() + 1) % items.length)
        return true
      }
      if (event.key === 'ArrowUp') {
        if (items.length) setActiveIndex((activeIndex() - 1 + items.length) % items.length)
        return true
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const item = items[activeIndex()]
        if (item) snapshot.command({id: item.id, label: item.label})
        return true
      }
      return false
    },
  })

  onMount(() => {
    if (!host) return
    const editor: Editor = new Editor({
      element: host,
      content: buildDocument(props.value),
      editorProps: {
        handleKeyDown: (view, event) => {
          if (event.key !== 'Enter') return false
          if (props.disabled) return true
          if (event.isComposing || view.composing || event.keyCode === 229) return false
          if (suggestion()) return false
          if (event.shiftKey) return editor.commands.splitBlock()
          props.onSubmit?.()
          return true
        },
        handlePaste: (_view, event) => {
          if (props.onPaste?.(event) === true) return true
          const clipboard = event.clipboardData
          if (!clipboard) return true
          if (clipboard.files.length > 0) return true
          const pasted = clipboard.getData('text/plain')
          if (!pasted) return true
          editor
            .chain()
            .command(({tr, state}) => {
              const slice = plainTextSlice(state.schema, pasted)
              if (!slice) return false
              tr.replaceSelection(slice).scrollIntoView()
              return true
            })
            .run()
          return true
        },
      },
      onUpdate: ({editor: instance}) => {
        const next = projectDocument(instance.state.doc.toJSON())
        batch(() => {
          setProjection(next)
          props.onValueChange(next)
        })
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
        ChipNode.configure({
          HTMLAttributes: {class: CHIP},
          deleteTriggerWithBackspace: true,
          renderText: ({node, suggestion: match}) =>
            chipDisplay(
              match?.char ?? String(node.attrs.mentionSuggestionChar ?? '@'),
              String(node.attrs.label ?? node.attrs.id ?? ''),
            ),
          renderHTML: ({options: mentionOptions, node, suggestion: match}) => [
            'span',
            mergeAttributes(mentionOptions.HTMLAttributes),
            chipDisplay(
              match?.char ?? String(node.attrs.mentionSuggestionChar ?? '@'),
              String(node.attrs.label ?? node.attrs.id ?? ''),
            ),
          ],
          suggestions: (props.triggers ?? []).map((trigger) => ({
            char: trigger.char,
            allowedPrefixes: [' ', '\t'],
            items: () => [],
            render: suggestionRenderer(trigger.char),
          })),
        }),
      ],
    })
    setEditorInstance(editor)
    setProjection(props.value)
    props.onReady?.({
      focus: (focusOptions) => {
        editor.commands.focus(focusOptions?.end ? 'end' : undefined)
      },
      clear: () => {
        editor.commands.clearContent(true)
      },
      insertText: (text) => {
        editor
          .chain()
          .focus()
          .command(({tr, state}) => {
            const slice = plainTextSlice(state.schema, text)
            if (!slice) return false
            tr.replaceSelection(slice).scrollIntoView()
            return true
          })
          .run()
      },
      appendText: (text) => {
        editor
          .chain()
          .command(({tr, state}) => {
            const slice = plainTextSlice(state.schema, text)
            if (!slice) return false
            const end = Selection.atEnd(state.doc).from
            tr.replace(end, end, slice)
            return true
          })
          .run()
      },
    })
  })
  onCleanup(() => editorInstance()?.destroy())

  createEffect(() => {
    const editor = editorInstance()
    if (!editor) return
    const value = props.value
    if (value === projection()) return
    const doc = editor.schema.nodeFromJSON(buildDocument(value))
    editor.view.updateState(
      EditorState.create({doc, selection: Selection.atEnd(doc), plugins: editor.state.plugins}),
    )
    setProjection(value)
  })

  createEffect(() => {
    const editor = editorInstance()
    if (!editor) return
    editor.setEditable(!props.disabled, false)
  })

  createEffect(() => {
    const editor = editorInstance()
    if (!editor) return
    const snapshot = suggestion()
    editor.view.setProps({
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': props.label,
        'aria-haspopup': 'listbox',
        'aria-expanded': snapshot ? 'true' : 'false',
        ...(snapshot ? {'aria-controls': listboxId, 'aria-activedescendant': optionId(activeIndex())} : {}),
        ...(props.disabled ? {'aria-disabled': 'true'} : {}),
        class: `${EDITABLE} ${props.editableClass ?? ''}`,
        style: `min-height: ${rowHeight(props.minRows ?? 1)}`,
      },
    })
  })

  return (
    <div class={FIELD} data-disabled={props.disabled ? '' : undefined}>
      <ScrollArea.Root>
        <ScrollArea.Viewport
          class={`${VIEWPORT}  ${props.viewportClass ?? ''}`}
          style={{'max-height': rowHeight(props.maxRows ?? 5)}}
        >
          <ScrollArea.Content>
            <div ref={(element) => (host = element)} class="w-full" />
          </ScrollArea.Content>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar>
          <ScrollArea.Thumb />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
      <Show when={projection() === '' && props.placeholder}>
        {(text) => <span class={PLACEHOLDER}>{text()}</span>}
      </Show>
      <Show when={suggestion()}>
        {(snapshot) => (
          <Show when={snapshot().rect}>
            {(rect) => (
              <div class={LISTBOX} style={{left: `${rect().left}px`, top: `${rect().bottom + 4}px`}}>
                <Show when={fetched.error}>
                  <div role="alert" class={STATUS}>
                    Couldn't load suggestions
                  </div>
                </Show>
                <Show when={!fetched.error && fetched.loading}>
                  <div role="status" class={STATUS}>
                    Loading…
                  </div>
                </Show>
                <Show when={!fetched.error && !fetched.loading && options().length === 0}>
                  <div role="status" class={STATUS}>
                    No results
                  </div>
                </Show>
                <ul role="listbox" id={listboxId} aria-label={activeSource()?.label ?? 'Suggestions'} class="m-0 p-0 list-none">
                  <For each={options()}>
                    {(item, position) => (
                      <li
                        id={optionId(position())}
                        role="option"
                        aria-selected={position() === activeIndex()}
                        class={OPTION}
                        onPointerDown={(event) => {
                          event.preventDefault()
                          snapshot().command({id: item.id, label: item.label})
                        }}
                      >
                        {activeSource()?.renderItem?.(item) ?? item.label}
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            )}
          </Show>
        )}
      </Show>
    </div>
  )
}
