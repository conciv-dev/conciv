import {createEffect, onCleanup, type JSX} from 'solid-js'
import {FileDiff, type FileContents, type FileDiffOptions} from '@pierre/diffs'

export type SolidFileDiffProps = {
  // The two sides of the diff. The renderer infers the language from `name` and highlights via Shiki.
  oldFile: FileContents
  newFile: FileContents
  options?: FileDiffOptions<undefined>
  class?: string
  style?: JSX.CSSProperties
}

// Solid wrapper over @pierre/diffs' imperative FileDiff renderer. Mirrors the library's React
// adapter: create the instance, hydrate it into the <diffs-container> host on mount, re-render on
// input change, and clean up on unmount. The custom element self-registers when @pierre/diffs is
// imported.
export function SolidFileDiff(props: SolidFileDiffProps): JSX.Element {
  let instance: FileDiff<undefined> | null = null

  const setRef = (node: HTMLElement) => {
    instance = new FileDiff(props.options, undefined, true)
    void instance.hydrate({oldFile: props.oldFile, newFile: props.newFile, fileContainer: node})
    onCleanup(() => {
      instance?.cleanUp()
      instance = null
    })
  }

  // Re-render when the files or options change. hydrate() did the first render; this keeps it live.
  createEffect(() => {
    const {oldFile, newFile, options} = props
    if (!instance) return
    if (options) instance.setOptions(options)
    void instance.render({oldFile, newFile, forceRender: true})
  })

  return <diffs-container ref={setRef} class={props.class} style={props.style} />
}
