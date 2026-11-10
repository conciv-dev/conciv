import {createMemo, onCleanup, splitProps, type JSX} from 'solid-js'
import {FileDiff, type FileContents, type FileDiffOptions} from '@pierre/diffs'
import {elementAttributes} from './element-attributes.js'
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
  const [, rest] = splitProps(props, ['oldFile', 'newFile', 'options', 'class', 'style'])
  const attributes = createMemo(() => elementAttributes(rest))
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

  return <diffs-container {...attributes()} ref={(node) => setRef(node)} class={props.class} style={props.style} />
}
