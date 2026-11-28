import {children, onCleanup, Show, untrack, type JSX} from 'solid-js'
import {FileDiff, type FileContents, type FileDiffOptions} from '@pierre/diffs'
import {syncRender} from './render-sync.js'
import {withHighlightWorkerPool} from './worker-pool.js'

export type SolidFileDiffProps = {
  oldFile: FileContents
  newFile: FileContents
  options?: FileDiffOptions<undefined, undefined>
  class?: string
  style?: JSX.CSSProperties
  headerMetadata?: JSX.Element
}

export function SolidFileDiff(props: SolidFileDiffProps): JSX.Element {
  let instance: FileDiff<undefined> | null = null
  const metadata = children(() => props.headerMetadata)

  const requestRender = syncRender({
    target: () => instance,
    payload: () => ({oldFile: props.oldFile, newFile: props.newFile}),
    options: () => props.options,
  })

  const setRef = (node: HTMLElement) => {
    onCleanup(() => {
      instance?.cleanUp()
      instance = null
    })
    withHighlightWorkerPool(props.options, (pool) =>
      untrack(() => {
        instance = new FileDiff(props.options, pool, requestRender)
        void instance.hydrate({oldFile: props.oldFile, newFile: props.newFile, fileContainer: node})
      }),
    )
  }

  return (
    <diffs-container ref={(node) => setRef(node)} class={props.class} style={props.style}>
      <Show when={metadata()}>
        <div slot="header-metadata">{metadata()}</div>
      </Show>
    </diffs-container>
  )
}
