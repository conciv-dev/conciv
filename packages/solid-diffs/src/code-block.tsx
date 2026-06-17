import {createEffect, onCleanup, type JSX} from 'solid-js'
import {File, type FileContents, type FileOptions} from '@pierre/diffs'

export type SolidCodeBlockProps = {
  // The file/code to render. The language is inferred from `name` (or set `file.lang`).
  file: FileContents
  options?: FileOptions<undefined>
  class?: string
  style?: JSX.CSSProperties
}

// Solid wrapper over @pierre/diffs' imperative File renderer — a single Shiki-highlighted code
// block. Same lifecycle as SolidFileDiff (create, hydrate on mount, re-render on change, clean up).
export function SolidCodeBlock(props: SolidCodeBlockProps): JSX.Element {
  let instance: File<undefined> | null = null

  const setRef = (node: HTMLElement) => {
    instance = new File(props.options, undefined, true)
    void instance.hydrate({file: props.file, fileContainer: node})
    onCleanup(() => {
      instance?.cleanUp()
      instance = null
    })
  }

  createEffect(() => {
    const {file, options} = props
    if (!instance) return
    if (options) instance.setOptions(options)
    void instance.render({file, forceRender: true})
  })

  return <diffs-container ref={setRef} class={props.class} style={props.style} />
}
