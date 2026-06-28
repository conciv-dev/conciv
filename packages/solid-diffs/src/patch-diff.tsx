import {createEffect, onCleanup, type JSX} from 'solid-js'
import {FileDiff, getSingularPatch, type FileDiffOptions} from '@pierre/diffs'

export type SolidPatchDiffProps = {
  // A unified diff string for EXACTLY ONE file (Pierre's getSingularPatch throws otherwise).
  patch: string
  options?: FileDiffOptions<undefined>
  class?: string
  style?: JSX.CSSProperties
}

// Solid wrapper over @pierre/diffs' imperative FileDiff, fed a parsed unified patch (mirrors the
// library's React PatchDiff: getSingularPatch → hydrate the FileDiff into the <diffs-container> host,
// re-render on change, clean up on unmount).
export function SolidPatchDiff(props: SolidPatchDiffProps): JSX.Element {
  let instance: FileDiff<undefined> | null = null
  let primed = false

  const setRef = (node: HTMLElement) => {
    instance = new FileDiff(props.options, undefined, true)
    void instance.hydrate({fileDiff: getSingularPatch(props.patch), fileContainer: node})
    onCleanup(() => {
      instance?.cleanUp()
      instance = null
    })
  }

  createEffect(() => {
    const {patch, options} = props
    if (!instance) return
    if (!primed) {
      primed = true
      return
    }
    if (options) instance.setOptions(options)
    void instance.render({fileDiff: getSingularPatch(patch), forceRender: true})
  })

  return <diffs-container ref={setRef} class={props.class} style={props.style} />
}
