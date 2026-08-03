import {createEffect, onCleanup, type JSX} from 'solid-js'
import {File, type FileContents, type FileOptions} from '@pierre/diffs'

export type SolidCodeBlockProps = {
  file: FileContents
  options?: FileOptions<undefined>
  class?: string
  style?: JSX.CSSProperties
}

export function SolidCodeBlock(props: SolidCodeBlockProps): JSX.Element {
  let instance: File<undefined> | null = null
  let primed = false

  const setRef = (node: HTMLElement) => {
    instance = new File(props.options, undefined, true)
    void instance.hydrate({file: props.file, fileContainer: node})
    onCleanup(() => {
      instance?.cleanUp()
      instance = null
    })
  }

  createEffect(() => {
    const file = props.file
    const options = props.options
    if (!instance) return
    if (!primed) {
      primed = true
      return
    }
    if (options) instance.setOptions(options)
    void instance.render({file, forceRender: true})
  })

  return <diffs-container ref={(node) => setRef(node)} class={props.class} style={props.style} />
}
