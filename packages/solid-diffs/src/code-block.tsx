import {onCleanup, type JSX} from 'solid-js'
import {File, type FileContents, type FileOptions} from '@pierre/diffs'
import {syncRender} from './render-sync.js'

export type SolidCodeBlockProps = {
  file: FileContents
  options?: FileOptions<undefined>
  class?: string
  style?: JSX.CSSProperties
}

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

  syncRender({
    target: () => instance,
    payload: () => ({file: props.file}),
    options: () => props.options,
  })

  return <diffs-container ref={(node) => setRef(node)} class={props.class} style={props.style} />
}
