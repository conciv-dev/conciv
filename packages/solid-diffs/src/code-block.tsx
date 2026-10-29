import {onCleanup, type JSX} from 'solid-js'
import {File, type FileContents, type FileOptions} from '@pierre/diffs'
import {syncRender} from './render-sync.js'
import {highlightWorkerPool} from './worker-pool.js'

export type SolidCodeBlockProps = {
  file: FileContents
  options?: FileOptions<undefined, undefined>
  class?: string
  style?: JSX.CSSProperties
}

export function SolidCodeBlock(props: SolidCodeBlockProps): JSX.Element {
  let instance: File<undefined> | null = null

  const requestRender = syncRender({
    target: () => instance,
    payload: () => ({file: props.file}),
    options: () => props.options,
  })

  const setRef = (node: HTMLElement) => {
    instance = new File(props.options, highlightWorkerPool(props.options), requestRender)
    void instance.hydrate({file: props.file, fileContainer: node})
    onCleanup(() => {
      instance?.cleanUp()
      instance = null
    })
  }

  return <diffs-container ref={(node) => setRef(node)} class={props.class} style={props.style} />
}
