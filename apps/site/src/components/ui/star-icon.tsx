import {useId} from 'react'
import {m, useReducedMotion} from 'motion/react'
import {AnimatedSvg, type IconProps} from './animated-svg'

const STAR = 'M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873z'

export default function StarIcon(props: IconProps) {
  const clipId = useId()
  const reduced = useReducedMotion()
  return (
    <AnimatedSvg
      {...props}
      start={(animate) => {
        if (reduced) {
          animate('.star-clip', {attrY: 0}, {duration: 0})
          return
        }
        animate('.star-outline', {pathLength: [0, 1]}, {duration: 0.4, ease: 'easeInOut'})
        animate('.star-clip', {attrY: [24, 0]}, {duration: 0.5, delay: 0.4, ease: 'easeOut'})
      }}
      stop={(animate) => {
        animate('.star-outline', {pathLength: 1}, {duration: reduced ? 0 : 0.15})
        animate('.star-clip', {attrY: 24}, reduced ? {duration: 0} : {duration: 0.4, ease: 'easeIn'})
      }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect className="star-clip" x={0} y={24} width={24} height={24} />
        </clipPath>
      </defs>
      <path d={STAR} className="fill-amber-400" stroke="none" clipPath={`url(#${clipId})`} />
      <m.path className="star-outline" d={STAR} />
    </AnimatedSvg>
  )
}
