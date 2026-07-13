import './jsx.js'
import {createEffect, onCleanup, type JSX} from 'solid-js'
import {FileDiff, getSingularPatch, type FileDiffOptions} from '@pierre/diffs'

export type SolidPatchDiffProps = {
  patch: string
  options?: FileDiffOptions<undefined>
  class?: string
  style?: JSX.CSSProperties
}

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
