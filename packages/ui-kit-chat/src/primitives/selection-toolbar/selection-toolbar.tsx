import {createSignal, onCleanup, onMount, Show, type Accessor, type JSX} from 'solid-js'
import {useComposer} from '../../store/chat-context.js'
import {Primitive} from '../util/primitive.js'

export type SelectionInfo = {text: string; rect: DOMRect}

export function useSelectionToolbarInfo(): Accessor<SelectionInfo | null> {
  const [info, setInfo] = createSignal<SelectionInfo | null>(null)
  const update = () => {
    const selection = document.getSelection()
    const text = selection?.toString().trim() ?? ''
    if (!selection || text.length === 0 || selection.rangeCount === 0) {
      setInfo(null)
      return
    }
    setInfo({text, rect: selection.getRangeAt(0).getBoundingClientRect()})
  }
  onMount(() => {
    document.addEventListener('selectionchange', update)
    onCleanup(() => document.removeEventListener('selectionchange', update))
  })
  return info
}

function Root(props: JSX.HTMLAttributes<HTMLDivElement>): JSX.Element {
  const info = useSelectionToolbarInfo()
  return (
    <Show when={info()}>
      <Primitive.div {...props} />
    </Show>
  )
}

function Quote(props: JSX.ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  const composer = useComposer()
  return (
    <button
      type="button"
      aria-label="Quote selection"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        const text = document.getSelection()?.toString().trim()
        if (text) composer.setText(`> ${text}\n\n`)
      }}
      {...props}
    />
  )
}

export const SelectionToolbar = Object.assign(Root, {Root, Quote})
