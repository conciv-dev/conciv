import {type ReactElement, useMemo, useRef} from 'react'
import {installStageSize} from '../core/stage-sheet.js'
import {BinaryEffectHost} from './mascot-binary.js'
import {MascotProvider} from './mascot-context.js'
import {MascotLayer} from './mascot-layer.js'
import {composeRefs, type MascotProps, mergeStyle} from './mascot-props.js'
import {useIsomorphicLayoutEffect} from './use-layout-effect.js'
import {useMascotHost} from './use-mascot.js'

export function MascotRoot(props: MascotProps): ReactElement {
  const {state, working, follow, activity, curve, initialSkin, style, ref, children, ...rest} = props
  const host = useMascotHost({state, working, follow, activity, curve, initialSkin})
  const element = useRef<HTMLSpanElement | null>(null)
  const setElement = useMemo(() => composeRefs(element, ref), [ref])
  const {parts, effects} = host.claims

  useIsomorphicLayoutEffect(() => {
    const node = element.current
    if (node === null) return
    installStageSize(node)
    host.rootProps.ref(node)
    return () => host.rootProps.release(node)
  }, [host.rootProps])

  return (
    <MascotProvider value={host.context}>
      <span
        aria-hidden="true"
        {...rest}
        data-scope="mascot"
        data-part="root"
        style={mergeStyle(host.rootProps.style, style)}
        ref={setElement}
      >
        {children}
        {parts.head === undefined ? <MascotLayer layer="head" fallback /> : null}
        {parts.antenna === undefined ? <MascotLayer layer="antenna" fallback /> : null}
        {parts.eyes === undefined ? <MascotLayer layer="eyes" fallback /> : null}
        {effects === 0 ? <BinaryEffectHost curve={curve} fallback /> : null}
      </span>
    </MascotProvider>
  )
}
