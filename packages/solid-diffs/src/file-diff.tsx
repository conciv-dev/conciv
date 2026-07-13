import './jsx.js'
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

  const setRef = (node: HTMLElement) => {
    instance = new FileDiff(props.options, undefined, true)
    void instance.hydrate({oldFile: props.oldFile, newFile: props.newFile, fileContainer: node})
    onCleanup(() => {
      instance?.cleanUp()
      instance = null
    })
  }

  createEffect(() => {
    const {oldFile, newFile, options} = props
    if (!instance) return
    if (!primed) {
      primed = true
      return
    }
    if (options) instance.setOptions(options)
    void instance.render({oldFile, newFile, forceRender: true})
  })

  return <diffs-container ref={setRef} class={props.class} style={props.style} />
}
