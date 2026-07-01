import {For, Show, createSignal, onCleanup, onMount, type JSX} from 'solid-js'
import {Editor} from '@tiptap/core'
import {Document} from '@tiptap/extension-document'
import {Paragraph} from '@tiptap/extension-paragraph'
import {Text} from '@tiptap/extension-text'
import {HardBreak} from '@tiptap/extension-hard-break'
import {Mention} from '@tiptap/extension-mention'
import {Avatar} from '@mandarax/ui-kit-system'

export type MentionItem = {id: string; label: string}
export type MentionSegment = {type: 'text'; text: string} | {type: 'mention'; id: string; label: string}
export type MentionFieldApi = {focus: () => void; clear: () => void; submit: () => void; element: HTMLElement}

type SuggestionState = {items: MentionItem[]; command: (item: MentionItem) => void; rect: DOMRect | null}
type JsonNode = {type?: string; text?: string; attrs?: Record<string, unknown>; content?: JsonNode[]}

const EDITOR =
  'min-h-7 max-h-32 overflow-auto bg-pw-sunken text-[0.8125rem] text-pw-text rounded-pw-md [border:1px_solid_var(--pw-line)] px-2 py-1.5 [outline:none] focus-within:[border-color:var(--pw-accent-line)] [&_.tiptap]:[outline:none] [&_[data-mention]]:text-pw-accent-hi [&_[data-mention]]:bg-pw-accent-08 [&_[data-mention]]:rounded-pw-sm [&_[data-mention]]:px-0.5'
const PLACEHOLDER = 'pointer-events-none absolute left-2 top-1.5 text-[0.8125rem] text-pw-text-3 select-none'
const LISTBOX =
  'fixed z-[2147483647] min-w-44 max-h-56 overflow-auto rounded-pw-md bg-pw-panel text-pw-text border border-pw-line shadow-pw-lg p-1'
const OPTION =
  'flex items-center gap-2 px-2 py-1.5 rounded-pw-sm text-[0.8125rem] cursor-pointer aria-selected:bg-pw-fill'

const serialize = (doc: JsonNode): MentionSegment[] => {
  const out: MentionSegment[] = []
  const pushText = (text: string): void => {
    if (!text) return
    const last = out.at(-1)
    if (last && last.type === 'text') last.text += text
    else out.push({type: 'text', text})
  }
  const inline = (nodes: JsonNode[] | undefined): void =>
    (nodes ?? []).forEach((node) => {
      if (node.type === 'text') pushText(node.text ?? '')
      else if (node.type === 'mention')
        out.push({
          type: 'mention',
          id: String(node.attrs?.id ?? ''),
          label: String(node.attrs?.label ?? node.attrs?.id ?? ''),
        })
      else if (node.type === 'hardBreak') pushText('\n')
    })
  const blocks = doc.content ?? []
  blocks.forEach((block, index) => {
    inline(block.content)
    if (index < blocks.length - 1) pushText('\n')
  })
  return out
}

// A TipTap (ProseMirror) composer with @mentions. ProseMirror ships real shadow-DOM selection support,
// so this works inside the comment overlay's shadow root where Slate/Lexical/textarea-caret tricks fail.
// The editor element is created once and never re-rendered by Solid (a re-render breaks the suggestion
// plugin); the participant listbox is a sibling the suggestion render hook drives via signals, so focus
// never leaves the editor.
export function MentionField(props: {
  items: (query: string) => MentionItem[]
  onSubmit: (segments: MentionSegment[]) => void
  onReady?: (api: MentionFieldApi) => void
  onEmptyChange?: (empty: boolean) => void
  placeholder?: string
  ariaLabel?: string
  class?: string
}): JSX.Element {
  let host: HTMLDivElement | undefined
  let editor: Editor | undefined
  const [empty, setEmpty] = createSignal(true)
  const [suggestion, setSuggestion] = createSignal<SuggestionState | null>(null)
  const [index, setIndex] = createSignal(0)

  const submit = (): void => {
    if (!editor || editor.isEmpty) return
    props.onSubmit(serialize(editor.getJSON() as JsonNode))
    editor.commands.clearContent()
    setEmpty(true)
    props.onEmptyChange?.(true)
  }

  onMount(() => {
    if (!host) return
    editor = new Editor({
      element: host,
      editorProps: {
        attributes: {role: 'textbox', 'aria-label': props.ariaLabel ?? 'Message', 'aria-multiline': 'true'},
        handleKeyDown: (_view, event) => {
          if (event.key === 'Enter' && !event.shiftKey && !suggestion()) {
            event.preventDefault()
            submit()
            return true
          }
          return false
        },
      },
      onUpdate: ({editor: instance}) => {
        setEmpty(instance.isEmpty)
        props.onEmptyChange?.(instance.isEmpty)
      },
      extensions: [
        Document,
        Paragraph,
        Text,
        HardBreak,
        Mention.configure({
          HTMLAttributes: {'data-mention': ''},
          suggestion: {
            char: '@',
            items: ({query}) => props.items(query),
            render: () => ({
              onStart: (start) => {
                setSuggestion({items: start.items, command: start.command, rect: start.clientRect?.() ?? null})
                setIndex(0)
              },
              onUpdate: (update) =>
                setSuggestion({items: update.items, command: update.command, rect: update.clientRect?.() ?? null}),
              onExit: () => setSuggestion(null),
              onKeyDown: ({event}) => {
                const state = suggestion()
                if (!state || state.items.length === 0) return false
                if (event.key === 'ArrowDown') {
                  setIndex((index() + 1) % state.items.length)
                  return true
                }
                if (event.key === 'ArrowUp') {
                  setIndex((index() - 1 + state.items.length) % state.items.length)
                  return true
                }
                if (event.key === 'Enter' || event.key === 'Tab') {
                  const item = state.items[index()]
                  if (item) state.command(item)
                  return true
                }
                if (event.key === 'Escape') {
                  setSuggestion(null)
                  return true
                }
                return false
              },
            }),
          },
        }),
      ],
    })
    props.onReady?.({
      focus: () => editor?.commands.focus(),
      clear: () => editor?.commands.clearContent(),
      submit,
      element: editor.view.dom,
    })
  })
  onCleanup(() => editor?.destroy())

  return (
    <div class={`relative w-full ${props.class ?? ''}`}>
      <div ref={(element) => (host = element)} class={EDITOR} />
      <Show when={empty() && props.placeholder}>{(text) => <span class={PLACEHOLDER}>{text()}</span>}</Show>
      <Show when={suggestion()}>
        {(state) => (
          <Show when={state().items.length > 0 && state().rect}>
            {(rect) => (
              <ul
                role="listbox"
                aria-label="Mention a participant"
                class={LISTBOX}
                style={{left: `${rect().left}px`, top: `${rect().bottom + 4}px`}}
              >
                <For each={state().items}>
                  {(item, position) => (
                    <li
                      role="option"
                      aria-selected={position() === index()}
                      class={OPTION}
                      onPointerDown={(event) => {
                        event.preventDefault()
                        state().command(item)
                      }}
                    >
                      <Avatar.Root class="size-5">
                        <Avatar.Fallback>{item.label.trim().charAt(0).toUpperCase() || '?'}</Avatar.Fallback>
                      </Avatar.Root>
                      {item.label}
                    </li>
                  )}
                </For>
              </ul>
            )}
          </Show>
        )}
      </Show>
    </div>
  )
}
