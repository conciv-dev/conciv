import {m} from 'motion/react'
import {AnimatedSvg, type IconProps} from './animated-svg'

const STAR = 'M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873z'

export default function StarIcon(props: IconProps) {
  return (
    <AnimatedSvg
      {...props}
      start={(animate) => {
        animate('.star-fill', {opacity: [0, 1], scale: [0.8, 1]}, {duration: 0.4, ease: 'easeOut'})
        animate('.star-outline', {scale: [1, 1.1, 1], rotate: [0, -5, 5, 0]}, {duration: 0.5, ease: 'easeInOut'})
      }}
      stop={(animate) => {
        animate('.star-fill', {opacity: 0}, {duration: 0.3, ease: 'easeOut'})
        animate('.star-outline', {scale: 1, rotate: 0}, {duration: 0.3, ease: 'easeInOut'})
      }}
    >
      <m.path className="star-fill" d={STAR} fill="currentColor" opacity={0} style={{transformOrigin: 'center'}} />
      <m.path className="star-outline" d={STAR} style={{transformOrigin: 'center'}} />
    </AnimatedSvg>
  )
}
