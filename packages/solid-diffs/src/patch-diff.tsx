import {createMemo, onCleanup, untrack, type JSX} from 'solid-js'
import {FileDiff, getSingularPatch, type FileDiffOptions} from '@pierre/diffs'
import {syncRender} from './render-sync.js'
import {withHighlightWorkerPool} from './worker-pool.js'

export type SolidPatchDiffProps = {
  patch: string
  options?: FileDiffOptions<undefined, undefined>
  class?: string
  style?: JSX.CSSProperties
}

export function SolidPatchDiff(props: SolidPatchDiffProps): JSX.Element {
  let instance: FileDiff<undefined> | null = null
  const singularPatch = createMemo(() => getSingularPatch(props.patch))

  const requestRender = syncRender({
    target: () => instance,
    payload: () => ({fileDiff: singularPatch()}),
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
        void instance.hydrate({fileDiff: singularPatch(), fileContainer: node})
      }),
    )
  }

  return <diffs-container ref={(node) => setRef(node)} class={props.class} style={props.style} />
}
