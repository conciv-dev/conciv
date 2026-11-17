import {children, onCleanup, Show, type JSX} from 'solid-js'
import {File, type FileContents, type FileOptions} from '@pierre/diffs'
import {syncRender} from './render-sync.js'
import {highlightWorkerPool} from './worker-pool.js'

export type SolidCodeBlockProps = {
  file: FileContents
  options?: FileOptions<undefined, undefined>
  class?: string
  style?: JSX.CSSProperties
  headerMetadata?: JSX.Element
  customHeader?: JSX.Element
}

export function SolidCodeBlock(props: SolidCodeBlockProps): JSX.Element {
  let instance: File<undefined> | null = null
  const metadata = children(() => props.headerMetadata)
  const customHeader = children(() => props.customHeader)

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

  return (
    <diffs-container ref={(node) => setRef(node)} class={props.class} style={props.style}>
      <Show when={metadata()}>
        <div slot="header-metadata">{metadata()}</div>
      </Show>
      <Show when={customHeader()}>
        <div slot="header-custom">{customHeader()}</div>
      </Show>
    </diffs-container>
  )
}
