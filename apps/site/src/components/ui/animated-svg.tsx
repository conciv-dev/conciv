import {useImperativeHandle, type ComponentProps, type ReactNode, type Ref} from 'react'
import {m, useAnimate} from 'motion/react'
import type {AnimatedIconHandle} from './types'

type Animate = ReturnType<typeof useAnimate>[1]

export type IconProps = {ref?: Ref<AnimatedIconHandle>; className?: string}

type AnimatedSvgProps = IconProps &
  Omit<ComponentProps<typeof m.svg>, 'ref' | 'children'> & {
    start: (animate: Animate) => void
    stop: (animate: Animate) => void
    children: ReactNode
  }

export function AnimatedSvg({ref, start, stop, children, ...svgProps}: AnimatedSvgProps) {
  const [scope, animate] = useAnimate()
  useImperativeHandle(ref, () => ({startAnimation: () => start(animate), stopAnimation: () => stop(animate)}))
  return (
    <m.svg
      ref={scope}
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{overflow: 'visible'}}
      {...svgProps}
    >
      {children}
    </m.svg>
  )
}
