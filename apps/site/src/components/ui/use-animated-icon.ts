import {useRef} from 'react'
import {useReducedMotion} from 'motion/react'
import type {AnimatedIconHandle} from './types'

export function useAnimatedIcon() {
  const iconRef = useRef<AnimatedIconHandle>(null)
  const reduced = useReducedMotion()
  const start = () => {
    if (reduced !== true) iconRef.current?.startAnimation()
  }
  const stop = () => iconRef.current?.stopAnimation()
  return {iconRef, triggerProps: {onPointerEnter: start, onPointerLeave: stop, onFocus: start, onBlur: stop}}
}
