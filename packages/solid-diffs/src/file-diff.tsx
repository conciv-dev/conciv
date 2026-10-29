import {onCleanup, type JSX} from 'solid-js'
import {FileDiff, type FileContents, type FileDiffOptions} from '@pierre/diffs'
import {syncRender} from './render-sync.js'
import {highlightWorkerPool} from './worker-pool.js'

export type SolidFileDiffProps = {
  oldFile: FileContents
  newFile: FileContents
  options?: FileDiffOptions<undefined, undefined>
  class?: string
  style?: JSX.CSSProperties
}

export function SolidFileDiff(props: SolidFileDiffProps): JSX.Element {
  let instance: FileDiff<undefined> | null = null

  const requestRender = syncRender({
    target: () => instance,
    payload: () => ({oldFile: props.oldFile, newFile: props.newFile}),
    options: () => props.options,
  })

  const setRef = (node: HTMLElement) => {
    instance = new FileDiff(props.options, highlightWorkerPool(props.options), requestRender)
    void instance.hydrate({oldFile: props.oldFile, newFile: props.newFile, fileContainer: node})
    onCleanup(() => {
      instance?.cleanUp()
      instance = null
    })
  }

  return <diffs-container ref={(node) => setRef(node)} class={props.class} style={props.style} />
}
