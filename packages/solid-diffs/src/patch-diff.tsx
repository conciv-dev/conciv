import {createMemo, onCleanup, type JSX} from 'solid-js'
import {FileDiff, getSingularPatch, type FileDiffOptions} from '@pierre/diffs'
import {syncRender} from './render-sync.js'

export type SolidPatchDiffProps = {
  patch: string
  options?: FileDiffOptions<undefined>
  class?: string
  style?: JSX.CSSProperties
}

export function SolidPatchDiff(props: SolidPatchDiffProps): JSX.Element {
  let instance: FileDiff<undefined> | null = null
  const singularPatch = createMemo(() => getSingularPatch(props.patch))

  const setRef = (node: HTMLElement) => {
    instance = new FileDiff(props.options, undefined, true)
    void instance.hydrate({fileDiff: singularPatch(), fileContainer: node})
    onCleanup(() => {
      instance?.cleanUp()
      instance = null
    })
  }

  syncRender({
    target: () => instance,
    payload: () => ({fileDiff: singularPatch()}),
    options: () => props.options,
  })

  return <diffs-container ref={(node) => setRef(node)} class={props.class} style={props.style} />
}
