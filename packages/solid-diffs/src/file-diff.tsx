import {createEffect, onCleanup, type JSX} from 'solid-js'
import {FileDiff, type FileContents, type FileDiffOptions} from '@pierre/diffs'

export type SolidFileDiffProps = {
  oldFile: FileContents
  newFile: FileContents
  options?: FileDiffOptions<undefined>
  class?: string
  style?: JSX.CSSProperties
}

export function SolidFileDiff(props: SolidFileDiffProps): JSX.Element {
  let instance: FileDiff<undefined> | null = null
  let primed = false
  let renderedOptions: FileDiffOptions<undefined> | undefined

  const setRef = (node: HTMLElement) => {
    renderedOptions = props.options
    instance = new FileDiff(renderedOptions, undefined, true)
    void instance.hydrate({oldFile: props.oldFile, newFile: props.newFile, fileContainer: node})
    onCleanup(() => {
      instance?.cleanUp()
      instance = null
    })
  }

  createEffect(() => {
    const oldFile = props.oldFile
    const newFile = props.newFile
    const options = props.options
    if (!instance) return
    if (!primed) {
      primed = true
      return
    }
    const optionsChanged = options !== renderedOptions
    renderedOptions = options
    if (options) instance.setOptions(options)
    void instance.render({oldFile, newFile, forceRender: optionsChanged})
  })

  return <diffs-container ref={(node) => setRef(node)} class={props.class} style={props.style} />
}
