import {type ReactElement, useMemo, useRef} from 'react'
import {type MascotPartName, useMascotContext} from './mascot-context.js'
import {composeRefs, type MascotLayerProps, mergeStyle} from './mascot-props.js'
import {useIsomorphicLayoutEffect} from './use-layout-effect.js'

export type MascotLayerHostProps = MascotLayerProps & {layer: MascotPartName; fallback?: boolean}

export function MascotLayer({layer, fallback, style, ref, ...rest}: MascotLayerHostProps): ReactElement {
  const {partProps, readClaim} = useMascotContext()
  const part = partProps(layer)
  const element = useRef<HTMLSpanElement | null>(null)
  const setElement = useMemo(() => composeRefs(element, ref), [ref])

  useIsomorphicLayoutEffect(() => {
    const node = element.current
    if (node === null) return
    if (fallback === true && readClaim(layer) !== undefined) return
    part.ref(node)
    return () => part.release(node)
  }, [readClaim, fallback, layer, part])

  return (
    <span
      aria-hidden="true"
      {...rest}
      data-scope="mascot"
      data-part={layer}
      style={mergeStyle(part.style, style, true)}
      ref={setElement}
    />
  )
}
