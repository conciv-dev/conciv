import {createEffect, createMemo, onCleanup, type JSX} from 'solid-js'
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
  let renderedOptions: FileDiffOptions<undefined> | undefined
  const singularPatch = createMemo(() => getSingularPatch(props.patch))

  const setRef = (node: HTMLElement) => {
    renderedOptions = props.options
    instance = new FileDiff(renderedOptions, undefined, true)
    void instance.hydrate({fileDiff: singularPatch(), fileContainer: node})
    onCleanup(() => {
      instance?.cleanUp()
      instance = null
    })
  }

  createEffect(() => {
    const fileDiff = singularPatch()
    const options = props.options
    if (!instance) return
    if (!primed) {
      primed = true
      return
    }
    const optionsChanged = options !== renderedOptions
    renderedOptions = options
    if (options) instance.setOptions(options)
    void instance.render({fileDiff, forceRender: optionsChanged})
  })

  return <diffs-container ref={(node) => setRef(node)} class={props.class} style={props.style} />
}
