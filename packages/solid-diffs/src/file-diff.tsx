import {onCleanup, type JSX} from 'solid-js'
import {FileDiff, type FileContents, type FileDiffOptions} from '@pierre/diffs'
import {syncRender} from './render-sync.js'

export type SolidFileDiffProps = {
  oldFile: FileContents
  newFile: FileContents
  options?: FileDiffOptions<undefined>
  class?: string
  style?: JSX.CSSProperties
}

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

  syncRender({
    target: () => instance,
    payload: () => ({oldFile: props.oldFile, newFile: props.newFile}),
    options: () => props.options,
  })

  return <diffs-container ref={(node) => setRef(node)} class={props.class} style={props.style} />
}
