import {forwardRef, useImperativeHandle} from 'react'
import type {AnimatedIconHandle, AnimatedIconProps} from './types'
import {m, useAnimate} from 'motion/react'

const SunIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  ({size = 24, color = 'currentColor', strokeWidth = 2, className = ''}, ref) => {
    const [scope, animate] = useAnimate()

    const start = async () => {
      animate('.sun-core', {scale: [1, 0.85, 1]}, {duration: 0.5, ease: 'easeInOut'})
      await animate('.sun-rays', {rotate: [0, 90]}, {duration: 0.6, ease: 'easeInOut'})
    }

    const stop = () => {
      animate('.sun-core', {scale: 1}, {duration: 0.2, ease: 'easeOut'})
      animate('.sun-rays', {rotate: 0}, {duration: 0.2, ease: 'easeOut'})
    }

    useImperativeHandle(ref, () => ({
      startAnimation: start,
      stopAnimation: stop,
    }))

    return (
      <m.svg
        ref={scope}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        style={{overflow: 'visible'}}
      >
        <m.circle className="sun-core" cx="12" cy="12" r="4" style={{transformOrigin: 'center'}} />
        <m.g className="sun-rays" style={{transformOrigin: 'center'}}>
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" />
          <path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m6.34 17.66-1.41 1.41" />
          <path d="m19.07 4.93-1.41 1.41" />
        </m.g>
      </m.svg>
    )
  },
)

SunIcon.displayName = 'SunIcon'

export default SunIcon
